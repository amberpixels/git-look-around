/**
 * Composable for accessing repository data from background worker
 */
import { ref, computed } from 'vue';
import { useBackgroundMessage } from './useBackgroundMessage';
import { MessageType } from '@/src/messages/types';
import type { RepoRecord } from '@/src/types';

// No longer needed - indexed status is now stored in the repo record itself

export function useRepos() {
  const { sendMessage } = useBackgroundMessage();

  const repos = ref<RepoRecord[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  // Track issue/PR counts for each repo
  const repoCounts = ref<Record<number, { issues: number; prs: number }>>({});

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
   * Split repos into indexed and non-indexed
   */
  const indexedRepos = computed(() => {
    const sorted = sortReposByVisitPriority(repos.value);
    return sorted.filter((repo) => repo.indexed !== false); // true or undefined = indexed
  });

  const nonIndexedRepos = computed(() => {
    const sorted = sortReposByVisitPriority(repos.value);
    return sorted.filter((repo) => repo.indexed === false); // explicitly false = not indexed
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
   * Load issue and PR counts for each repo
   */
  async function fetchCounts() {
    const counts: Record<number, { issues: number; prs: number }> = {};

    await Promise.all(
      repos.value.map(async (repo) => {
        try {
          const [issues, prs] = await Promise.all([
            sendMessage<unknown[]>(MessageType.GET_ISSUES_BY_REPO, repo.id),
            sendMessage<unknown[]>(MessageType.GET_PRS_BY_REPO, repo.id),
          ]);
          counts[repo.id] = {
            issues: issues.length,
            prs: prs.length,
          };
        } catch (err) {
          console.error(`[useRepos] Error loading counts for repo ${repo.id}:`, err);
          counts[repo.id] = { issues: 0, prs: 0 };
        }
      }),
    );

    repoCounts.value = counts;
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
    loading,
    error,
    fetchRepos,
    fetchCounts,
    loadAll,
    addRepoToIndex,
  };
}
