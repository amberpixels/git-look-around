import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import {
  runSync,
  getSyncStatus,
  updateSyncStatus,
  forceSync,
  startQuickCheckLoop,
  setQuickCheckBrowsingMode,
  setQuickCheckIdleMode,
} from '@/src/sync/engine';
import { getLastRateLimit } from '@/src/api/github';
import {
  getAllRepos,
  getIssuesByRepo,
  getPullRequestsByRepo,
  recordVisit,
  setRepoIndexed,
} from '@/src/storage/db';
import { useUnifiedSearch } from '@/src/composables/useUnifiedSearch';
import type { SearchableEntity, SearchResultItem } from '@/src/composables/useUnifiedSearch';
import { useSearchCache } from '@/src/composables/useSearchCache';

/**
 * Determine which result should be cached as "first result"
 * Takes into account quick-switcher logic that swaps current repo
 */
function getFirstResultToCache(
  results: SearchResultItem[],
  currentRepoName: string | null | undefined,
): SearchResultItem | null {
  if (results.length === 0) return null;
  if (!currentRepoName) return results[0];

  // Check if first result is the current repo (will be swapped)
  const first = results[0];
  const isCurrentRepo =
    (first.type === 'repo' && first.title === currentRepoName) ||
    (first.type !== 'repo' && first.repoName === currentRepoName);

  // If first result is current repo and we have a second result, cache the second
  if (isCurrentRepo && results.length >= 2) {
    console.log(
      '[Background] First result is current repo, caching second result instead:',
      results[1].title,
    );
    return results[1];
  }

  return results[0];
}

/**
 * Extract top 2 contributors (besides current user) from results
 */
function extractContributors(
  results: SearchResultItem[],
  currentUsername: string | undefined,
): string[] {
  if (!currentUsername) return [];

  const userCounts = new Map<string, number>();

  results.forEach((item) => {
    if (item.type === 'pr' || item.type === 'issue') {
      const author = item.user?.login;
      if (author && author !== currentUsername) {
        userCounts.set(author, (userCounts.get(author) || 0) + 1);
      }
    }
  });

  return Array.from(userCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([username]) => username);
}

export default defineBackground(() => {
  console.warn('[Background] Gitjump background initialized', { id: browser.runtime.id });

  // Initialize search cache
  const {
    loadCache,
    saveCache,
    saveFirstResult,
    loadSearchResults,
    saveSearchResults,
    saveContributors,
  } = useSearchCache();

  // Initialize sync system
  (async () => {
    // Clear any stuck sync state from previous session (e.g., hot-reload, extension restart)
    const status = await getSyncStatus();
    if (status.isRunning) {
      console.warn('[Background] Clearing stuck sync state from previous session...');
      await updateSyncStatus({
        isRunning: false,
        lastError: 'Extension reloaded - sync state reset',
      });
    }

    // Run initial sync
    console.warn('[Background] Starting initial sync...');
    try {
      await runSync();
      console.warn('[Background] Initial sync completed, starting quick-check loop...');
      startQuickCheckLoop();
    } catch (err) {
      console.error('[Background] Initial sync failed:', err);
      // Still start quick-check even if initial sync fails
      startQuickCheckLoop();
    }
  })();

  // Listen for keyboard command
  browser.commands.onCommand.addListener((command) => {
    if (command === 'toggle-overlay') {
      // Send message to active tab's content script
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs[0]?.id) {
          const message: ExtensionMessage = {
            type: MessageType.TOGGLE_OVERLAY,
          };
          browser.tabs.sendMessage(tabs[0].id, message);
        }
      });
    }
  });

  // Handle messages from popup and content scripts
  browser.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case MessageType.GET_SYNC_STATUS: {
            const status = await getSyncStatus();
            sendResponse({ success: true, data: status });
            break;
          }

          case MessageType.GET_RATE_LIMIT: {
            const rateLimit = await getLastRateLimit();
            sendResponse({ success: true, data: rateLimit });
            break;
          }

          case MessageType.GET_ALL_REPOS: {
            const repos = await getAllRepos();
            sendResponse({ success: true, data: repos });
            break;
          }

          case MessageType.GET_ISSUES_BY_REPO: {
            const repoId = message.payload as number;
            const issues = await getIssuesByRepo(repoId);
            sendResponse({ success: true, data: issues });
            break;
          }

          case MessageType.GET_PRS_BY_REPO: {
            const repoId = message.payload as number;
            const prs = await getPullRequestsByRepo(repoId);
            sendResponse({ success: true, data: prs });
            break;
          }

          case MessageType.FORCE_SYNC: {
            await forceSync();
            sendResponse({ success: true });
            break;
          }

          case MessageType.RECORD_VISIT: {
            const { type, entityId } = message.payload as {
              type: 'repo' | 'issue' | 'pr';
              entityId: number;
            };
            await recordVisit(type, entityId);
            sendResponse({ success: true });
            break;
          }

          case MessageType.SET_REPO_INDEXED: {
            const { repoId, indexed } = message.payload as {
              repoId: number;
              indexed: boolean;
            };
            await setRepoIndexed(repoId, indexed);
            sendResponse({ success: true });
            break;
          }

          case MessageType.SET_QUICK_CHECK_BROWSING: {
            setQuickCheckBrowsingMode();
            sendResponse({ success: true });
            break;
          }

          case MessageType.SET_QUICK_CHECK_IDLE: {
            setQuickCheckIdleMode();
            sendResponse({ success: true });
            break;
          }

          case MessageType.SEARCH: {
            const { query, currentUsername, currentRepoName } = message.payload as {
              query: string;
              currentUsername?: string;
              currentRepoName?: string | null;
            };

            // For empty queries, try to return cached results immediately
            if (!query) {
              const cachedResults = await loadSearchResults();
              if (cachedResults) {
                console.log('[Background] Returning cached search results:', cachedResults.length);
                sendResponse({ success: true, data: cachedResults, cacheSaved: false });

                // Keep service worker alive and update cache in background
                // Don't use IIFE - directly await so service worker stays alive
                const cachedEntities = await loadCache();
                let entities: SearchableEntity[];

                if (cachedEntities) {
                  entities = cachedEntities;
                } else {
                  const repos = await getAllRepos();
                  const indexedRepos = repos.filter((repo) => repo.indexed);
                  entities = await Promise.all(
                    indexedRepos.map(async (repo) => {
                      const [issues, prs] = await Promise.all([
                        getIssuesByRepo(repo.id),
                        getPullRequestsByRepo(repo.id),
                      ]);
                      return { repo, issues, prs };
                    }),
                  );
                  await saveCache(entities);
                }

                const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
                await setEntities(entities);
                const freshResults = searchResults.value('');

                // Save fresh results, first result, and contributors
                console.log('[Background] Updating cache with fresh results');
                await saveSearchResults(freshResults);
                const contributors = extractContributors(freshResults, currentUsername);
                await saveContributors(contributors);
                const firstResultToCache = getFirstResultToCache(freshResults, currentRepoName);
                if (firstResultToCache) {
                  await saveFirstResult(firstResultToCache);
                  console.log('[Background] Updated first result cache:', firstResultToCache.title);
                }

                break;
              }
            }

            // No cached results or non-empty query - do full fetch
            const cachedEntities = await loadCache();

            let entities: SearchableEntity[];

            if (cachedEntities) {
              // Use cached data immediately
              entities = cachedEntities;
            } else {
              // Get all repos
              const repos = await getAllRepos();

              // Filter to indexed repos only
              const indexedRepos = repos.filter((repo) => repo.indexed);

              // Build SearchableEntity array
              entities = await Promise.all(
                indexedRepos.map(async (repo) => {
                  const [issues, prs] = await Promise.all([
                    getIssuesByRepo(repo.id),
                    getPullRequestsByRepo(repo.id),
                  ]);
                  return { repo, issues, prs };
                }),
              );

              // Save to cache for next time
              await saveCache(entities);
            }

            // Use useUnifiedSearch to get sorted results
            const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
            await setEntities(entities);
            const results = searchResults.value(query);

            // Cache the first result for instant display next time (only for empty query)
            let cacheSaved = false;
            if (!query && results.length > 0) {
              try {
                const firstResultToCache = getFirstResultToCache(results, currentRepoName);
                if (firstResultToCache) {
                  await saveFirstResult(firstResultToCache);
                }
                await saveSearchResults(results);
                const contributors = extractContributors(results, currentUsername);
                await saveContributors(contributors);
                cacheSaved = true;
              } catch (err) {
                console.error('[Background] Failed to save first result cache:', err);
              }
            }

            sendResponse({ success: true, data: results, cacheSaved });

            // Update cache in background if we used cached data
            if (cachedEntities) {
              (async () => {
                try {
                  const repos = await getAllRepos();
                  const indexedRepos = repos.filter((repo) => repo.indexed);
                  const freshEntities: SearchableEntity[] = await Promise.all(
                    indexedRepos.map(async (repo) => {
                      const [issues, prs] = await Promise.all([
                        getIssuesByRepo(repo.id),
                        getPullRequestsByRepo(repo.id),
                      ]);
                      return { repo, issues, prs };
                    }),
                  );
                  await saveCache(freshEntities);
                } catch (err) {
                  console.error('[Background] Failed to update cache in background:', err);
                }
              })();
            }

            break;
          }

          case MessageType.DEBUG_SEARCH: {
            const { query, currentUsername, currentRepoName } = message.payload as {
              query: string;
              currentUsername?: string;
              currentRepoName?: string | null;
            };

            // For empty queries, try to return cached results immediately
            if (!query) {
              const cachedResults = await loadSearchResults();
              if (cachedResults) {
                // Add debug info to cached results
                const debugResults = cachedResults.map((r) => ({
                  ...r,
                  _debug: {
                    lastVisitedAt: r.lastVisitedAt,
                    lastVisitedAtFormatted: r.lastVisitedAt
                      ? new Date(r.lastVisitedAt).toISOString()
                      : 'never',
                    score: r.score,
                    bucket: r.lastVisitedAt ? 'visited' : 'never-visited',
                    isMine: r.isMine,
                    recentlyContributed: r.recentlyContributedByMe,
                    state: r.state,
                    updatedAt: r.updatedAt,
                    updatedAtFormatted: r.updatedAt
                      ? new Date(r.updatedAt).toISOString()
                      : 'unknown',
                  },
                }));

                console.log(
                  '[Background] [DEBUG_SEARCH] Returning cached search results:',
                  cachedResults.length,
                );
                sendResponse({ success: true, data: debugResults, cacheSaved: false });

                // Keep service worker alive and update cache in background
                const cachedEntities = await loadCache();
                let entities: SearchableEntity[];

                if (cachedEntities) {
                  entities = cachedEntities;
                } else {
                  const repos = await getAllRepos();
                  const indexedRepos = repos.filter((repo) => repo.indexed);
                  entities = await Promise.all(
                    indexedRepos.map(async (repo) => {
                      const [issues, prs] = await Promise.all([
                        getIssuesByRepo(repo.id),
                        getPullRequestsByRepo(repo.id),
                      ]);
                      return { repo, issues, prs };
                    }),
                  );
                  await saveCache(entities);
                }

                const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
                await setEntities(entities);
                const freshResults = searchResults.value('');

                console.log('[Background] [DEBUG_SEARCH] Updating cache with fresh results');
                await saveSearchResults(freshResults);
                const contributors = extractContributors(freshResults, currentUsername);
                await saveContributors(contributors);
                const firstResultToCache = getFirstResultToCache(freshResults, currentRepoName);
                if (firstResultToCache) {
                  await saveFirstResult(firstResultToCache);
                  console.log(
                    '[Background] [DEBUG_SEARCH] Updated first result cache:',
                    firstResultToCache.title,
                  );
                }

                break;
              }
            }

            // No cached results - do full fetch
            const cachedEntitiesDebug = await loadCache();

            let entities: SearchableEntity[];

            if (cachedEntitiesDebug) {
              // Use cached data immediately
              entities = cachedEntitiesDebug;
            } else {
              // Get all repos
              const repos = await getAllRepos();

              // Filter to indexed repos only
              const indexedRepos = repos.filter((repo) => repo.indexed);

              // Build SearchableEntity array
              entities = await Promise.all(
                indexedRepos.map(async (repo) => {
                  const [issues, prs] = await Promise.all([
                    getIssuesByRepo(repo.id),
                    getPullRequestsByRepo(repo.id),
                  ]);
                  return { repo, issues, prs };
                }),
              );

              // Save to cache for next time
              await saveCache(entities);
            }

            // Use useUnifiedSearch to get sorted results
            const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
            await setEntities(entities);
            const results = searchResults.value(query);

            // Cache the first result for instant display next time (only for empty query)
            let cacheSaved = false;
            if (!query && results.length > 0) {
              try {
                const firstResultToCache = getFirstResultToCache(results, currentRepoName);
                if (firstResultToCache) {
                  await saveFirstResult(firstResultToCache);
                }
                await saveSearchResults(results);
                const contributors = extractContributors(results, currentUsername);
                await saveContributors(contributors);
                cacheSaved = true;
              } catch (err) {
                console.error(
                  '[Background] [DEBUG_SEARCH] Failed to save first result cache:',
                  err,
                );
              }
            }

            // Add debug info to each result
            const debugResults = results.map((r) => ({
              ...r,
              _debug: {
                lastVisitedAt: r.lastVisitedAt,
                lastVisitedAtFormatted: r.lastVisitedAt
                  ? new Date(r.lastVisitedAt).toISOString()
                  : 'never',
                score: r.score,
                bucket: r.lastVisitedAt ? 'visited' : 'never-visited',
                isMine: r.isMine,
                recentlyContributed: r.recentlyContributedByMe,
                state: r.state,
                updatedAt: r.updatedAt,
                updatedAtFormatted: r.updatedAt ? new Date(r.updatedAt).toISOString() : 'unknown',
              },
            }));

            sendResponse({ success: true, data: debugResults, cacheSaved });
            break;
          }

          default:
            sendResponse({ success: false, error: 'Unknown message type' });
        }
      } catch (error) {
        console.error('[Background] Message handler error:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();

    // Return true to indicate we'll respond asynchronously
    return true;
  });
});
