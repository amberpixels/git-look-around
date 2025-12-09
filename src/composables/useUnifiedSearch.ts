/**
 * Composable for unified search across repos, PRs, and issues
 * Returns a flat list of search results with type-based weighting
 */
import { ref, computed, type Ref } from 'vue';
import type { RepoRecord, IssueRecord, PullRequestRecord } from '@/src/types';

export type SearchResultType = 'repo' | 'pr' | 'issue';

export interface SearchResultItem {
  type: SearchResultType;
  id: string; // Unique key: `${type}-${entity_id}`
  entityId: number; // Original entity ID
  title: string;
  url: string;
  repoId?: number; // For PRs/issues - parent repo ID
  repoName?: string; // For PRs/issues - parent repo full_name
  number?: number; // For PRs/issues - issue/PR number
  state?: 'open' | 'closed'; // For PRs/issues
  user?: {
    login: string;
    avatar_url: string;
  };
  // PR-specific
  draft?: boolean;
  merged?: boolean;
  // Metadata for scoring
  score: number; // Search relevance score (higher = better)
  lastVisitedAt?: number;
  updatedAt?: number;
  // Flags for sorting
  isMine?: boolean; // Authored by current user (PR/Issue) or Owned by current user (Repo)
  recentlyContributedByMe?: boolean; // Contributed to in last 2 months
}

export interface SearchableEntity {
  repo: RepoRecord;
  issues: IssueRecord[];
  prs: PullRequestRecord[];
}

const TWO_MONTHS_MS = 2 * 30 * 24 * 60 * 60 * 1000;

/**
 * Extract prefix from a repo name (everything before first hyphen)
 * Examples:
 *   "hellotickets/ht-mixer" -> "ht-"
 *   "myorg/pr-backend" -> "pr-"
 *   "github/no-prefix" -> null
 */
function extractRepoPrefix(fullName: string): string | null {
  // Get repo name without org (after last slash)
  const repoName = fullName.split('/').pop() || fullName;

  // Find first hyphen
  const hyphenIndex = repoName.indexOf('-');
  if (hyphenIndex > 0) {
    return repoName.substring(0, hyphenIndex + 1); // Include the hyphen
  }

  return null;
}

/**
 * Analyze repos to find common prefixes
 * Returns prefixes that appear in >= 3 repos AND >= 10% of total repos
 */
async function analyzeCommonPrefixes(repos: RepoRecord[]): Promise<string[]> {
  const prefixCounts = new Map<string, number>();

  // Count prefix occurrences
  for (const repo of repos) {
    const prefix = extractRepoPrefix(repo.full_name);
    if (prefix) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
    }
  }

  // Filter by thresholds
  const minRepos = Math.max(3, Math.ceil(repos.length * 0.1)); // At least 3 or 10%
  const commonPrefixes: string[] = [];

  for (const [prefix, count] of prefixCounts.entries()) {
    if (count >= minRepos) {
      commonPrefixes.push(prefix);
    }
  }

  // Debug log: show analysis results
  const { debugLog } = await import('@/src/utils/debug');
  await debugLog('[useUnifiedSearch] Common prefix analysis:', {
    totalRepos: repos.length,
    threshold: `>= ${minRepos} repos (10% of ${repos.length})`,
    allPrefixes: Array.from(prefixCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([prefix, count]) => `${prefix} (${count} repos)`),
    commonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : '(none detected)',
  });

  return commonPrefixes;
}

/**
 * Calculate search score for a text match
 * Scoring priority:
 * 1. Exact match: 1000
 * 2. Common prefix + query: 950 (e.g., "ht-mixer" when searching "mixer" and "ht-" is common)
 * 3. Starts with query: 800 (e.g., "mixer-app")
 * 4. Word/segment ends with query: 600 (e.g., "ht-mixer" when searching "mixer", no common prefix)
 * 5. Word boundary at start: 500 (e.g., " mixer" or "-mixer")
 * 6. Word boundary anywhere: 400
 * 7. Space word boundary: 300
 * 8. Contains query: 100
 */
function calculateMatchScore(text: string, query: string, commonPrefixes: string[] = []): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match
  if (lowerText === lowerQuery) return 1000;

  // Check for common prefix + query (e.g., "ht-mixer" when searching "mixer" and "ht-" is common)
  // This should rank very high - almost like an exact match
  for (const prefix of commonPrefixes) {
    const prefixPattern = prefix.toLowerCase();
    if (lowerText.includes(prefixPattern + lowerQuery)) {
      // Check if this is the main part (e.g., "org/ht-mixer" or just "ht-mixer")
      const afterQuery =
        lowerText.indexOf(prefixPattern + lowerQuery) + prefixPattern.length + lowerQuery.length;
      // Higher score if query is at end or followed by word boundary
      if (
        afterQuery === lowerText.length ||
        [' ', '-', '/', '_', '.'].includes(lowerText[afterQuery])
      ) {
        return 950; // Common prefix + query at end/boundary - almost exact!
      }
      return 900; // Common prefix + query in middle
    }
  }

  // Starts with query
  if (lowerText.startsWith(lowerQuery)) return 800;

  // Word/segment ends with query (e.g., "ht-mixer" ends with "mixer")
  // This handles cases like "ht-mixer", "my-project", "some/path"
  const wordBoundaryChars = [' ', '-', '/', '_', '.'];
  for (const char of wordBoundaryChars) {
    if (lowerText.endsWith(lowerQuery) || lowerText.includes(`${char}${lowerQuery}`)) {
      // Check if it's at a word boundary at the start
      if (
        lowerText.startsWith(`${lowerQuery}${char}`) ||
        lowerText.includes(`${char}${lowerQuery}${char}`)
      ) {
        return 500; // Word boundary at start of word
      }
      // Check if query appears after a boundary (e.g., "ht-mixer" contains "-mixer")
      const index = lowerText.indexOf(`${char}${lowerQuery}`);
      if (index >= 0) {
        // Higher score if it's the end of a segment (e.g., "ht-mixer" not "ht-mixer-v2")
        const afterQuery = index + char.length + lowerQuery.length;
        if (afterQuery === lowerText.length || wordBoundaryChars.includes(lowerText[afterQuery])) {
          return 600; // Ends with query after boundary
        }
        return 400; // Word boundary but not at end
      }
    }
  }

  // Check for word boundary with space specifically (legacy behavior)
  if (lowerText.includes(` ${lowerQuery}`)) return 300;

  // Contains query anywhere
  if (lowerText.includes(lowerQuery)) return 100;

  return 0; // No match
}

export function useUnifiedSearch(currentUsername?: Ref<string | undefined> | string) {
  const allEntities = ref<SearchableEntity[]>([]);
  const commonPrefixes = ref<string[]>([]);

  // Support both ref and plain string
  const username = computed(() => {
    if (typeof currentUsername === 'object' && 'value' in currentUsername) {
      return currentUsername.value;
    }
    return currentUsername;
  });

  /**
   * Check if a date is within the last 2 months
   */
  function isRecent(dateStr?: string | null): boolean {
    if (!dateStr) return false;
    const date = new Date(dateStr).getTime();
    return Date.now() - date < TWO_MONTHS_MS;
  }

  /**
   * Build a flat list of all searchable items
   */
  function buildSearchResults(query: string = ''): SearchResultItem[] {
    const results: SearchResultItem[] = [];
    const normalizedQuery = query.trim().toLowerCase();
    const currentUser = username.value;

    for (const entity of allEntities.value) {
      const { repo, issues, prs } = entity;

      // Calculate repo match score
      const repoNameScore = calculateMatchScore(
        repo.full_name,
        normalizedQuery,
        commonPrefixes.value,
      );
      const repoDescScore = repo.description
        ? calculateMatchScore(repo.description, normalizedQuery, commonPrefixes.value)
        : 0;
      const repoMatchScore = Math.max(repoNameScore, repoDescScore);

      // Add repo if matches or if no query (show all)
      if (!normalizedQuery || repoMatchScore > 0) {
        results.push({
          type: 'repo',
          id: `repo-${repo.id}`,
          entityId: repo.id,
          title: repo.full_name,
          url: repo.html_url,
          score: repoMatchScore,
          lastVisitedAt: repo.last_visited_at,
          updatedAt: repo.pushed_at ? new Date(repo.pushed_at).getTime() : undefined,
          state: 'open', // Repos are always "open"
          isMine: currentUser ? repo.owner.login === currentUser : false,
          recentlyContributedByMe: isRecent(repo.last_contributed_at),
        });
      }

      // Add PRs
      for (const pr of prs) {
        const prTitleScore = calculateMatchScore(pr.title, normalizedQuery, commonPrefixes.value);
        const prNumberMatch = normalizedQuery && pr.number.toString().includes(normalizedQuery);

        if (!normalizedQuery || prTitleScore > 0 || prNumberMatch) {
          const matchScore = prNumberMatch ? 800 : prTitleScore;
          results.push({
            type: 'pr',
            id: `pr-${pr.id}`,
            entityId: pr.id,
            title: pr.title,
            url: pr.html_url,
            repoId: repo.id,
            repoName: repo.full_name,
            number: pr.number,
            state: pr.state,
            user: pr.user,
            draft: pr.draft,
            merged: pr.merged,
            score: matchScore,
            lastVisitedAt: pr.last_visited_at,
            updatedAt: new Date(pr.updated_at).getTime(),
            isMine: currentUser ? pr.user.login === currentUser : false,
            recentlyContributedByMe: false, // We don't track per-PR contribution dates yet
          });
        }
      }

      // Add issues
      for (const issue of issues) {
        const issueTitleScore = calculateMatchScore(
          issue.title,
          normalizedQuery,
          commonPrefixes.value,
        );
        const issueNumberMatch =
          normalizedQuery && issue.number.toString().includes(normalizedQuery);

        if (!normalizedQuery || issueTitleScore > 0 || issueNumberMatch) {
          const matchScore = issueNumberMatch ? 800 : issueTitleScore;
          results.push({
            type: 'issue',
            id: `issue-${issue.id}`,
            entityId: issue.id,
            title: issue.title,
            url: issue.html_url,
            repoId: repo.id,
            repoName: repo.full_name,
            number: issue.number,
            state: issue.state,
            user: issue.user,
            score: matchScore,
            lastVisitedAt: issue.last_visited_at,
            updatedAt: new Date(issue.updated_at).getTime(),
            isMine: currentUser ? issue.user.login === currentUser : false,
            recentlyContributedByMe: false, // We don't track per-issue contribution dates yet
          });
        }
      }
    }

    return results;
  }

  /**
   * Sort search results by:
   * 1. Visited items first (by last_visited_at DESC) - visit recency is the strongest signal
   * 2. For never-visited items: search score (text match quality)
   * 3. State (Open/Repo > Closed)
   * 4. isMine (Authored/Owned by me)
   * 5. recentlyContributedByMe (Contributed in last 2 months)
   * 6. Updated At (DESC)
   */
  function sortResults(results: SearchResultItem[], hasQuery: boolean): SearchResultItem[] {
    return [...results].sort((a, b) => {
      // PRIORITY 1: Visited items come before never-visited items
      const hasVisitedA = a.lastVisitedAt != null;
      const hasVisitedB = b.lastVisitedAt != null;

      if (hasVisitedA && !hasVisitedB) return -1; // A visited, B not → A first
      if (!hasVisitedA && hasVisitedB) return 1; // B visited, A not → B first

      // PRIORITY 2: Both visited → sort by visit time DESC (most recent first)
      if (hasVisitedA && hasVisitedB) {
        return b.lastVisitedAt! - a.lastVisitedAt!;
      }

      // PRIORITY 3: Both never-visited → use search score (text match quality)
      if (hasQuery && a.score !== b.score) {
        return b.score - a.score;
      }

      // State: Open > Closed
      // Repos are treated as 'open'
      const isOpenA = a.state === 'open';
      const isOpenB = b.state === 'open';

      if (isOpenA && !isOpenB) return -1; // A open, B closed → A first
      if (!isOpenA && isOpenB) return 1; // B open, A closed → B first

      // isMine (Authored/Owned by me)
      if (a.isMine !== b.isMine) {
        return a.isMine ? -1 : 1;
      }

      // recentlyContributedByMe
      if (a.recentlyContributedByMe !== b.recentlyContributedByMe) {
        return a.recentlyContributedByMe ? -1 : 1;
      }

      // Both never-visited: sort by updated_at DESC
      const updatedA = a.updatedAt ?? 0;
      const updatedB = b.updatedAt ?? 0;
      return updatedB - updatedA;
    });
  }

  /**
   * Get filtered and sorted search results
   */
  const searchResults = computed(() => {
    return (query: string = '') => {
      const results = buildSearchResults(query);
      return sortResults(results, !!query.trim());
    };
  });

  /**
   * Set the searchable entities (repos with their PRs/issues)
   */
  async function setEntities(entities: SearchableEntity[]) {
    allEntities.value = entities;

    // Analyze repos to find common prefixes
    const repos = entities.map((e) => e.repo);
    commonPrefixes.value = await analyzeCommonPrefixes(repos);
  }

  return {
    searchResults,
    setEntities,
  };
}
