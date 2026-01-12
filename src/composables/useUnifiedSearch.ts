/**
 * Composable for unified search across repos, PRs, and issues
 * Returns a flat list of search results with type-based weighting
 */
import { ref, computed, type Ref } from 'vue';
import type { RepoRecord, IssueRecord, PullRequestRecord } from '@/src/types';

export type SearchResultType = 'repo' | 'pr' | 'issue' | 'skeleton';

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
  assignee?: {
    login: string;
    avatar_url: string;
  } | null;
  // PR-specific
  draft?: boolean;
  merged?: boolean;
  // Metadata for scoring
  score: number; // Search relevance score (higher = better)
  lastVisitedAt?: number;
  updatedAt?: number;
  closedAt?: number; // Timestamp when PR/Issue was closed (null if open)
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
 *   "mycompany/mc-acme" -> "mc-"
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
 * Analyze repos to find dominant organizations
 * Returns organizations that represent >= 80% of all repos
 * These orgs are considered "main" and should be ignored in short queries
 */
async function analyzeDominantOrgs(repos: RepoRecord[]): Promise<string[]> {
  const orgCounts = new Map<string, number>();
  const totalRepos = repos.length;

  // Count repos per organization
  for (const repo of repos) {
    const org = repo.full_name.split('/')[0]; // Get "my-company" from "my-company/mc-acme"
    if (org) {
      orgCounts.set(org, (orgCounts.get(org) || 0) + 1);
    }
  }

  // Find organizations with >= 80% of repos
  const threshold = totalRepos * 0.8;
  const dominant: string[] = [];

  for (const [org, count] of orgCounts.entries()) {
    if (count >= threshold) {
      dominant.push(org);
    }
  }

  // Debug log
  const { debugLog } = await import('@/src/utils/debug');
  await debugLog('[useUnifiedSearch] Dominant org analysis:', {
    totalRepos,
    threshold: `>= ${threshold} repos (80% of ${totalRepos})`,
    allOrgs: Array.from(orgCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([org, count]) => `${org} (${count} repos, ${Math.round((count / totalRepos) * 100)}%)`),
    dominantOrgs: dominant.length > 0 ? dominant : '(none detected)',
  });

  return dominant;
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
 * 2. Common prefix + query: 950 (e.g., "my-foobar" when searching "foobar" and "my-" is common)
 * 3. Starts with query: 800 (e.g., "foobar-app" when searching "foobar")
 * 4. Word/segment ends with query: 600 (e.g., "my-foobar" when searching "foobar", no common prefix)
 * 5. Word boundary at start: 500 (e.g., " foobar" or "-foobar")
 * 6. Word boundary anywhere: 400
 * 7. Space word boundary: 300
 * 8. Contains query: 100 (NOT for single-char queries)
 *
 * Special rule: Single-character queries (1 char) only match:
 * - Starts with (prefix)
 * - After word boundaries (-, /, _, ., space)
 * This prevents matching "foobar" when searching "o"
 */
function calculateMatchScore(text: string, query: string, commonPrefixes: string[] = []): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const isSingleChar = lowerQuery.length === 1;

  // Exact match
  if (lowerText === lowerQuery) return 1000;

  // Check for common prefix + query (e.g., "my-foobar" when searching "foobar" and "my-" is common)
  // This should rank very high - almost like an exact match
  for (const prefix of commonPrefixes) {
    const prefixPattern = prefix.toLowerCase();
    if (lowerText.includes(prefixPattern + lowerQuery)) {
      // Check if this is the main part (e.g., "org/my-foobar" or just "my-foobar")
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

  // Word/segment ends with query (e.g., "my-foobar" ends with "foobar")
  // This handles cases like "my-foobar", "my-project", "some/path"
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
      // Check if query appears after a boundary (e.g., "my-foobar" contains "-foobar")
      const index = lowerText.indexOf(`${char}${lowerQuery}`);
      if (index >= 0) {
        // Higher score if it's the end of a segment (e.g., "my-foobar" not "my-foobar-v2")
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

  // Contains query anywhere - BUT NOT for single-character queries
  // Single-char queries should only match prefix or word boundaries to avoid noise
  if (!isSingleChar && lowerText.includes(lowerQuery)) return 100;

  return 0; // No match
}

export function useUnifiedSearch(currentUsername?: Ref<string | undefined> | string) {
  const allEntities = ref<SearchableEntity[]>([]);
  const commonPrefixes = ref<string[]>([]);
  const dominantOrgs = ref<string[]>([]); // Organizations that represent ≥80% of repos
  const orgFilterPreferences = ref<Record<string, boolean>>({}); // Organization filter preferences

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

  function isMyPullRequest(pr: PullRequestRecord, currentUser?: string): boolean {
    if (!currentUser) return false;
    // Use case-insensitive comparison since GitHub usernames are case-insensitive
    const currentUserLower = currentUser.toLowerCase();
    if (pr.user.login.toLowerCase() === currentUserLower) return true;
    if (pr.assignee?.login.toLowerCase() === currentUserLower) return true;
    if (pr.assignees?.some((assignee) => assignee.login.toLowerCase() === currentUserLower))
      return true;
    if (
      pr.requested_reviewers?.some((reviewer) => reviewer.login.toLowerCase() === currentUserLower)
    )
      return true;
    return false;
  }

  /**
   * Check if a repo should be included based on org filter preferences
   */
  function shouldIncludeRepo(repoFullName: string): boolean {
    const parts = repoFullName.split('/');
    if (parts.length < 2) return true; // Safety: include if we can't parse

    const [org] = parts;

    // If no filter preferences set, include everything (default)
    if (Object.keys(orgFilterPreferences.value).length === 0) {
      return true;
    }

    // If org is not in preferences, include it (default to enabled)
    if (!(org in orgFilterPreferences.value)) {
      return true;
    }

    // Return the preference value
    return orgFilterPreferences.value[org] === true;
  }

  /**
   * Build a flat list of all searchable items
   */
  function buildSearchResults(query: string = ''): SearchResultItem[] {
    const results: SearchResultItem[] = [];
    const normalizedQuery = query.trim().toLowerCase();
    const currentUser = username.value;

    // TODO: respect isShortQuery ??
    //const isShortQuery = normalizedQuery.length > 0 && normalizedQuery.length <= 2;

    for (const entity of allEntities.value) {
      const { repo, issues, prs } = entity;

      // Filter by organization preferences
      if (!shouldIncludeRepo(repo.full_name)) {
        continue; // Skip this entire entity (repo, issues, PRs)
      }

      // Calculate repo match score
      // Check if we should ignore org name for matching
      let repoNameForMatching = repo.full_name;
      const org = repo.full_name.split('/')[0];
      const isDominantOrg = dominantOrgs.value.some(
        (dominantOrg) => dominantOrg.toLowerCase() === org.toLowerCase(),
      );

      // If org is dominant (>=80% of repos), ignore it and only match on repo name
      // This ensures "foobar" matches "mycompany/foobar" with exact match score
      if (isDominantOrg) {
        repoNameForMatching = repo.full_name.split('/').pop() || repo.full_name;
      }

      const repoNameScore = calculateMatchScore(
        repoNameForMatching,
        normalizedQuery,
        commonPrefixes.value,
      );
      // Repo descriptions are free text, don't use common prefixes
      const repoDescScore = repo.description
        ? calculateMatchScore(repo.description, normalizedQuery, [])
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
          isMine: currentUser
            ? repo.owner.login.toLowerCase() === currentUser.toLowerCase()
            : false,
          recentlyContributedByMe: isRecent(repo.last_contributed_at),
        });
      }

      // Add PRs
      for (const pr of prs) {
        // Don't use common prefixes for PRs - they're for repo naming conventions, not PR titles
        const prTitleScore = calculateMatchScore(pr.title, normalizedQuery, []);
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
            assignee: pr.assignee,
            draft: pr.draft,
            merged: pr.merged,
            score: matchScore,
            lastVisitedAt: pr.last_visited_at,
            updatedAt: new Date(pr.updated_at).getTime(),
            closedAt: pr.closed_at ? new Date(pr.closed_at).getTime() : undefined,
            isMine: isMyPullRequest(pr, currentUser),
            recentlyContributedByMe: false, // We don't track per-PR contribution dates yet
          });
        }
      }

      // Add issues
      for (const issue of issues) {
        // Don't use common prefixes for Issues - they're for repo naming conventions, not issue titles
        const issueTitleScore = calculateMatchScore(issue.title, normalizedQuery, []);
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
            assignee: issue.assignee,
            score: matchScore,
            lastVisitedAt: issue.last_visited_at,
            updatedAt: new Date(issue.updated_at).getTime(),
            closedAt: issue.closed_at ? new Date(issue.closed_at).getTime() : undefined,
            isMine: currentUser
              ? issue.user.login.toLowerCase() === currentUser.toLowerCase()
              : false,
            recentlyContributedByMe: false, // We don't track per-issue contribution dates yet
          });
        }
      }
    }

    return results;
  }

  /**
   * Sort search results by:
   * 1. Search score (text match quality) - group by score tiers
   * 2. For short queries (≤2 chars): Repos before PRs/Issues within same score
   * 3. Within same score tier and type: visited items first (by last_visited_at DESC)
   * 4. For never-visited items within same tier: State (Open/Repo > Closed)
   * 5. isMine (Authored/Owned by me)
   * 6. recentlyContributedByMe (Contributed in last 2 months)
   * 7. Updated At (DESC)
   */
  function sortResults(
    results: SearchResultItem[],
    hasQuery: boolean,
    query: string = '',
  ): SearchResultItem[] {
    const normalizedQuery = query.trim();
    const isShortQuery = normalizedQuery.length > 0 && normalizedQuery.length <= 2;

    return [...results].sort((a, b) => {
      // PRIORITY 1: When searching, group by search score first
      // This ensures high-quality matches (score 800+) appear before weak matches (score 100)
      if (hasQuery && a.score !== b.score) {
        return b.score - a.score; // Higher score = better match
      }

      // PRIORITY 2: For short queries (1-2 chars), prioritize repos over PRs/Issues
      // Short queries are exploratory - users are looking for repos, not drilling into PRs
      // This happens BEFORE checking visits so repos always beat PRs when scores are equal
      if (isShortQuery && hasQuery) {
        const isRepoA = a.type === 'repo';
        const isRepoB = b.type === 'repo';

        if (isRepoA && !isRepoB) return -1; // A is repo, B is PR/Issue → A first
        if (!isRepoA && isRepoB) return 1; // B is repo, A is PR/Issue → B first
      }

      // PRIORITY 3: Within same score tier (and type for short queries), visited items come before never-visited
      const hasVisitedA = a.lastVisitedAt != null;
      const hasVisitedB = b.lastVisitedAt != null;

      if (hasVisitedA && !hasVisitedB) return -1; // A visited, B not → A first
      if (!hasVisitedA && hasVisitedB) return 1; // B visited, A not → B first

      // PRIORITY 4: Both visited → sort by visit time DESC (most recent first)
      if (hasVisitedA && hasVisitedB) {
        return b.lastVisitedAt! - a.lastVisitedAt!;
      }

      // PRIORITY 5: Both never-visited → secondary factors
      // State: Open > Closed (repos are treated as 'open')
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

      // Final tiebreaker: sort by updated_at DESC
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
      const hasQuery = !!query.trim();
      const results = buildSearchResults(query);

      // Filter out old closed PRs/Issues when actively searching
      let filteredResults = results;
      if (hasQuery) {
        const now = Date.now();

        // Calculate today's midnight in local timezone
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const todayMidnightTimestamp = todayMidnight.getTime();

        // 12 hours ago
        const twelveHoursAgo = now - 12 * 60 * 60 * 1000;

        filteredResults = results.filter((item) => {
          // Keep repos (not PRs/Issues)
          if (item.type !== 'pr' && item.type !== 'issue') return true;

          // Keep if open
          if (item.state === 'open') return true;

          // Keep if merged (merged PRs are relevant)
          if (item.type === 'pr' && item.merged) return true;

          // For closed PRs/Issues: check if closed recently using closedAt
          // (1) Closed today (after today's midnight) OR (2) Closed within last 12 hours
          if (item.closedAt) {
            const closedAfterTodayMidnight = item.closedAt >= todayMidnightTimestamp;
            const closedWithinLast12Hours = item.closedAt >= twelveHoursAgo;

            if (closedAfterTodayMidnight || closedWithinLast12Hours) {
              return true;
            }
          }

          // Filter out old closed PRs/Issues
          return false;
        });
      }

      return sortResults(filteredResults, hasQuery, query);
    };
  });

  /**
   * Set the searchable entities (repos with their PRs/issues)
   */
  async function setEntities(entities: SearchableEntity[]) {
    allEntities.value = entities;

    // Analyze repos to find common prefixes and dominant organizations
    const repos = entities.map((e) => e.repo);
    commonPrefixes.value = await analyzeCommonPrefixes(repos);
    dominantOrgs.value = await analyzeDominantOrgs(repos);

    // Load organization filter preferences
    const { getOrgFilterPreferences } = await import('@/src/storage/chrome');
    const prefs = await getOrgFilterPreferences();
    orgFilterPreferences.value = prefs.enabledOrgs;
  }

  return {
    searchResults,
    setEntities,
  };
}
