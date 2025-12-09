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

/**
 * Type weights for search scoring (higher = more relevant)
 * Repos are most important, then PRs, then issues
 */
const TYPE_WEIGHTS = {
  repo: 100,
  pr: 10,
  issue: 5,
} as const;

const TWO_MONTHS_MS = 2 * 30 * 24 * 60 * 60 * 1000;

/**
 * Calculate search score for a text match
 * - Exact match at start: highest score
 * - Exact match anywhere: medium score
 * - Partial match: lower score
 */
function calculateMatchScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerText === lowerQuery) return 1000; // Perfect match
  if (lowerText.startsWith(lowerQuery)) return 500; // Starts with
  if (lowerText.includes(` ${lowerQuery}`)) return 300; // Word boundary
  if (lowerText.includes(lowerQuery)) return 100; // Contains

  return 0; // No match
}

export function useUnifiedSearch(currentUsername?: Ref<string | undefined> | string) {
  const allEntities = ref<SearchableEntity[]>([]);

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
      const repoNameScore = calculateMatchScore(repo.full_name, normalizedQuery);
      const repoDescScore = repo.description
        ? calculateMatchScore(repo.description, normalizedQuery)
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
          score: repoMatchScore * TYPE_WEIGHTS.repo,
          lastVisitedAt: repo.last_visited_at,
          updatedAt: repo.pushed_at ? new Date(repo.pushed_at).getTime() : undefined,
          state: 'open', // Repos are always "open"
          isMine: currentUser ? repo.owner.login === currentUser : false,
          recentlyContributedByMe: isRecent(repo.last_contributed_at),
        });
      }

      // Add PRs
      for (const pr of prs) {
        const prTitleScore = calculateMatchScore(pr.title, normalizedQuery);
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
            score: matchScore * TYPE_WEIGHTS.pr,
            lastVisitedAt: pr.last_visited_at,
            updatedAt: new Date(pr.updated_at).getTime(),
            isMine: currentUser ? pr.user.login === currentUser : false,
            recentlyContributedByMe: false, // We don't track per-PR contribution dates yet
          });
        }
      }

      // Add issues
      for (const issue of issues) {
        const issueTitleScore = calculateMatchScore(issue.title, normalizedQuery);
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
            score: matchScore * TYPE_WEIGHTS.issue,
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
   * 1. Search score (if query provided)
   * 2. Visited items first (by last_visited_at DESC)
   * 3. State (Open/Repo > Closed)
   * 4. isMine (Authored/Owned by me)
   * 5. recentlyContributedByMe (Contributed in last 2 months)
   * 6. Updated At (DESC)
   */
  function sortResults(results: SearchResultItem[], hasQuery: boolean): SearchResultItem[] {
    return [...results].sort((a, b) => {
      // If there's a query, score is primary
      if (hasQuery && a.score !== b.score) {
        return b.score - a.score;
      }

      // Visited items come before never-visited items
      const hasVisitedA = a.lastVisitedAt != null;
      const hasVisitedB = b.lastVisitedAt != null;

      if (hasVisitedA && !hasVisitedB) return -1; // A visited, B not → A first
      if (!hasVisitedA && hasVisitedB) return 1; // B visited, A not → B first

      // Both visited: sort by visit time DESC
      if (hasVisitedA && hasVisitedB) {
        return b.lastVisitedAt! - a.lastVisitedAt!;
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
  function setEntities(entities: SearchableEntity[]) {
    allEntities.value = entities;
  }

  return {
    searchResults,
    setEntities,
  };
}
