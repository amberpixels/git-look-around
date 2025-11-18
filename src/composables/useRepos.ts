/**
 * Composable for accessing repository data from background worker
 */
import { ref, computed } from 'vue';
import { useBackgroundMessage } from './useBackgroundMessage';
import { MessageType } from '@/src/messages/types';
import type { RepoRecord, IssueRecord, PullRequestRecord } from '@/src/types';

export function useRepos() {
  const { sendMessage } = useBackgroundMessage();

  const repos = ref<RepoRecord[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  // Track issue/PR counts for each repo
  const repoCounts = ref<Record<number, { issues: number; prs: number }>>({});
  const repoSearchIndex = ref<Record<number, { issues: string[]; prs: string[] }>>({});

  /**
   * Sort repos by priority:
   * 1. Visited repos (sorted by last_visited_at descending)
   * 2. Unvisited repos where me_contributing=true (sorted by pushed_at descending)
   * 3. Unvisited repos where me_contributing=false (sorted by pushed_at descending)
   */
  function sortReposByVisitPriority(reposToSort: RepoRecord[]): RepoRecord[] {
    return [...reposToSort].sort((a, b) => {
      const visitedA = a.last_visited_at || 0;
      const visitedB = b.last_visited_at || 0;
      const contributingA = a.me_contributing ?? false;
      const contributingB = b.me_contributing ?? false;

      // Both visited - sort by visit time
      if (visitedA > 0 && visitedB > 0) {
        if (visitedA !== visitedB) {
          return visitedB - visitedA; // Most recently visited first
        }
        // Same visit time, fall back to pushed_at
        const pushedA = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
        const pushedB = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
        return pushedB - pushedA;
      }

      // One visited, one not - visited always first
      if (visitedA > 0 && visitedB === 0) return -1;
      if (visitedA === 0 && visitedB > 0) return 1;

      // Both unvisited - check contributor status
      if (contributingA && !contributingB) return -1; // Contributing repos first
      if (!contributingA && contributingB) return 1;

      // Both have same contributor status - sort by pushed_at
      const pushedA = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
      const pushedB = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
      return pushedB - pushedA;
    });
  }

  /**
   * Sort repos once, then split into indexed and non-indexed
   */
  const sortedRepos = computed(() => sortReposByVisitPriority(repos.value));

  const indexedRepos = computed(() => {
    return sortedRepos.value.filter((repo) => repo.indexed !== false); // true or undefined = indexed
  });

  const nonIndexedRepos = computed(() => {
    return sortedRepos.value.filter((repo) => repo.indexed === false); // explicitly false = not indexed
  });

  /**
   * Load all repos from background
   */
  async function fetchRepos() {
    try {
      error.value = null;
      repos.value = await sendMessage<RepoRecord[]>(MessageType.GET_ALL_REPOS);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load repos';
      console.error('[useRepos] Error loading repos:', err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Load issue and PR counts for indexed repos only
   * Non-indexed repos don't need counts since they don't show PRs/issues
   */
  async function fetchCounts() {
    const counts: Record<number, { issues: number; prs: number }> = {};
    const searchIndex: Record<number, { issues: string[]; prs: string[] }> = {};

    // Only fetch counts for indexed repos to avoid unnecessary API calls
    const reposToFetch = repos.value.filter((repo) => repo.indexed !== false);

    await Promise.all(
      reposToFetch.map(async (repo) => {
        try {
          const [issues, prs] = await Promise.all([
            sendMessage<IssueRecord[]>(MessageType.GET_ISSUES_BY_REPO, repo.id),
            sendMessage<PullRequestRecord[]>(MessageType.GET_PRS_BY_REPO, repo.id),
          ]);
          counts[repo.id] = {
            issues: issues.length,
            prs: prs.length,
          };
          searchIndex[repo.id] = {
            issues: issues.map((issue) => (issue.title || '').toLowerCase()),
            prs: prs.map((pr) => (pr.title || '').toLowerCase()),
          };
        } catch (err) {
          console.error(`[useRepos] Error loading counts for repo ${repo.id}:`, err);
          counts[repo.id] = { issues: 0, prs: 0 };
          searchIndex[repo.id] = { issues: [], prs: [] };
        }
      }),
    );

    repoCounts.value = counts;
    repoSearchIndex.value = searchIndex;
  }

  /**
   * Load repos and their counts
   */
  async function loadAll() {
    await fetchRepos();
    await fetchCounts();
  }

  /**
   * Add repo to index (user clicked + button)
   */
  async function addRepoToIndex(repoId: number) {
    try {
      await sendMessage(MessageType.SET_REPO_INDEXED, { repoId, indexed: true });
      // Reload repos to reflect changes
      await fetchRepos();
    } catch (err) {
      console.error(`[useRepos] Error adding repo ${repoId} to index:`, err);
      throw err;
    }
  }

  return {
    repos,
    indexedRepos,
    nonIndexedRepos,
    repoCounts,
    repoSearchIndex,
    loading,
    error,
    fetchRepos,
    fetchCounts,
    loadAll,
    addRepoToIndex,
  };
}
