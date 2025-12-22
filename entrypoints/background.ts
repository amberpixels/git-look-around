import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import {
  runImport,
  getImportStatus,
  updateImportStatus,
  forceImport,
  startQuickCheckLoop,
  setQuickCheckBrowsingMode,
  setQuickCheckIdleMode,
} from '@/src/import/engine';
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
 * Check if search results have meaningfully changed (order or presence of items)
 * Ignores metadata like timestamps, scores, etc.
 */
function hasResultsOrderChanged(
  oldResults: SearchResultItem[],
  newResults: SearchResultItem[],
): boolean {
  if (oldResults.length !== newResults.length) return true;

  for (let i = 0; i < oldResults.length; i++) {
    const oldItem = oldResults[i];
    const newItem = newResults[i];

    // Compare identity: type + entityId (unique identifier)
    if (oldItem.type !== newItem.type || oldItem.entityId !== newItem.entityId) {
      return true;
    }
  }

  return false;
}

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
  console.warn('[Background] Git Look Around background initialized', { id: browser.runtime.id });

  // Cache generation counter to prevent stale updates
  let cacheGeneration = 0;

  // Initialize search cache
  const {
    loadCache,
    saveCache,
    saveFirstResult,
    loadSearchResults,
    saveSearchResults,
    saveContributors,
    clearSearchResultsCache,
  } = useSearchCache();

  // Initialize sync system
  (async () => {
    // Clear any stuck sync state from previous session (e.g., hot-reload, extension restart)
    const status = await getImportStatus();
    if (status.isRunning) {
      console.warn('[Background] Clearing stuck sync state from previous session...');
      await updateImportStatus({
        isRunning: false,
        lastError: 'Extension reloaded - sync state reset',
      });
    }

    // Check if token exists before running initial sync
    const { getGitHubToken } = await import('@/src/storage/chrome');
    const token = await getGitHubToken();

    if (!token) {
      console.warn(
        '[Background] No GitHub token found - skipping initial sync. Sync will start when token is configured.',
      );
      // Still start quick-check loop (it will skip checks until token is available)
      startQuickCheckLoop();
      return;
    }

    // Run initial sync
    console.warn('[Background] Starting initial sync...');
    try {
      await runImport();
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
          case MessageType.GET_IMPORT_STATUS: {
            const status = await getImportStatus();
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

          case MessageType.FORCE_IMPORT: {
            await forceImport();
            sendResponse({ success: true });
            break;
          }

          case MessageType.RECORD_VISIT: {
            const { type, entityId } = message.payload as {
              type: 'repo' | 'issue' | 'pr';
              entityId: number;
            };
            await recordVisit(type, entityId);
            // Clear cached search results and bump generation to invalidate in-flight updates
            await clearSearchResultsCache();
            cacheGeneration++;
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
              if (cachedResults && cachedResults.length > 0) {
                sendResponse({ success: true, data: cachedResults, cacheSaved: false });

                // Capture current generation for this background update
                const updateGeneration = cacheGeneration;

                // Keep service worker alive and update cache in background
                // ALWAYS fetch fresh from IndexedDB (don't use cached entities)
                // to ensure visit tracking updates are reflected
                const repos = await getAllRepos();
                const indexedRepos = repos.filter((repo) => repo.indexed);
                const entities = await Promise.all(
                  indexedRepos.map(async (repo) => {
                    const [issues, prs] = await Promise.all([
                      getIssuesByRepo(repo.id),
                      getPullRequestsByRepo(repo.id),
                    ]);
                    return { repo, issues, prs };
                  }),
                );
                await saveCache(entities);

                // Check if cache was cleared while we were fetching
                if (cacheGeneration !== updateGeneration) {
                  break;
                }

                const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
                await setEntities(entities);
                const freshResults = searchResults.value('');

                // Final check before saving
                if (cacheGeneration !== updateGeneration) {
                  break;
                }

                // Check if results order changed compared to what we returned
                if (hasResultsOrderChanged(cachedResults, freshResults)) {
                  // Notify all tabs that cache was updated
                  browser.tabs.query({}).then((tabs) => {
                    tabs.forEach((tab) => {
                      if (tab.id) {
                        browser.tabs
                          .sendMessage(tab.id, {
                            type: MessageType.CACHE_UPDATED,
                            payload: freshResults,
                          })
                          .catch(() => {
                            // Tab might not have content script, ignore
                          });
                      }
                    });
                  });
                }

                await saveSearchResults(freshResults);
                const contributors = extractContributors(freshResults, currentUsername);
                await saveContributors(contributors);
                const firstResultToCache = getFirstResultToCache(freshResults, currentRepoName);
                if (firstResultToCache) {
                  await saveFirstResult(firstResultToCache);
                }

                break;
              }
            }

            // No cached results or non-empty query - do full fetch
            // Bump generation to cancel any in-flight background cache updates
            cacheGeneration++;

            const cachedEntities = await loadCache();

            let entities: SearchableEntity[];

            if (cachedEntities && cachedEntities.length > 0) {
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
            if (cachedEntities && cachedEntities.length > 0) {
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
              if (cachedResults && cachedResults.length > 0) {
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
                    merged: r.merged,
                    draft: r.draft,
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

                // Capture current generation for this background update
                const updateGeneration = cacheGeneration;
                console.log(
                  '[Background] [DEBUG_SEARCH] Starting background cache update (gen',
                  updateGeneration,
                  ')',
                );

                // Keep service worker alive and update cache in background
                // ALWAYS fetch fresh from IndexedDB (don't use cached entities)
                // to ensure visit tracking updates are reflected
                const repos = await getAllRepos();
                const indexedRepos = repos.filter((repo) => repo.indexed);
                const entities = await Promise.all(
                  indexedRepos.map(async (repo) => {
                    const [issues, prs] = await Promise.all([
                      getIssuesByRepo(repo.id),
                      getPullRequestsByRepo(repo.id),
                    ]);
                    return { repo, issues, prs };
                  }),
                );
                await saveCache(entities);

                // Check if cache was cleared while we were fetching
                if (cacheGeneration !== updateGeneration) {
                  console.log(
                    '[Background] [DEBUG_SEARCH] Cache generation changed, skipping stale update',
                  );
                  break;
                }

                const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
                await setEntities(entities);
                const freshResults = searchResults.value('');

                // Final check before saving
                if (cacheGeneration !== updateGeneration) {
                  console.log(
                    '[Background] [DEBUG_SEARCH] Cache generation changed before save, skipping',
                  );
                  break;
                }

                console.log(
                  '[Background] [DEBUG_SEARCH] Updating cache with fresh results (gen',
                  updateGeneration,
                  ')',
                );

                // Check if results order changed compared to what we returned
                // Strip debug info before comparison
                const cachedResultsWithoutDebug = cachedResults.map((r) => {
                  const { _debug, ...rest } = r as SearchResultItem & { _debug?: unknown };
                  return rest;
                });
                if (hasResultsOrderChanged(cachedResultsWithoutDebug, freshResults)) {
                  console.log(
                    '[Background] [DEBUG_SEARCH] Results order changed, notifying content script',
                  );
                  // Add debug info to fresh results before sending
                  const debugFreshResults = freshResults.map((r) => ({
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
                      merged: r.merged,
                      draft: r.draft,
                      updatedAt: r.updatedAt,
                      updatedAtFormatted: r.updatedAt
                        ? new Date(r.updatedAt).toISOString()
                        : 'unknown',
                    },
                  }));

                  // Notify all tabs that cache was updated
                  browser.tabs.query({}).then((tabs) => {
                    tabs.forEach((tab) => {
                      if (tab.id) {
                        browser.tabs
                          .sendMessage(tab.id, {
                            type: MessageType.CACHE_UPDATED,
                            payload: debugFreshResults,
                          })
                          .catch(() => {
                            // Tab might not have content script, ignore
                          });
                      }
                    });
                  });
                }

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
            // Bump generation to cancel any in-flight background cache updates
            cacheGeneration++;

            const cachedEntitiesDebug = await loadCache();

            let entities: SearchableEntity[];

            if (cachedEntitiesDebug && cachedEntitiesDebug.length > 0) {
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
                console.error('[Background] Failed to save first result cache:', err);
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
                merged: r.merged,
                draft: r.draft,
                updatedAt: r.updatedAt,
                updatedAtFormatted: r.updatedAt ? new Date(r.updatedAt).toISOString() : 'unknown',
              },
            }));

            sendResponse({ success: true, data: debugResults, cacheSaved });
            break;
          }

          case MessageType.FETCH_AND_SAVE_PR: {
            const { owner, repo, prNumber, repoId } = message.payload as {
              owner: string;
              repo: string;
              prNumber: number;
              repoId: number;
            };

            try {
              const { getPullRequest } = await import('@/src/api/github');
              const { savePullRequest } = await import('@/src/storage/db');

              // Fetch PR from GitHub
              const pr = await getPullRequest(owner, repo, prNumber);

              // Create PR record with merged field computed
              const prRecord = {
                ...pr,
                merged: pr.merged_at !== null,
                repo_id: repoId,
                last_fetched_at: Date.now(),
              };

              // Save to database
              await savePullRequest(prRecord);

              console.log(`[Background] Fetched and saved PR #${prNumber} for ${owner}/${repo}`);
              sendResponse({ success: true, data: prRecord });
            } catch (error) {
              console.error(`[Background] Failed to fetch PR #${prNumber}:`, error);
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch PR',
              });
            }
            break;
          }

          case MessageType.FETCH_AND_SAVE_ISSUE: {
            const { owner, repo, issueNumber, repoId } = message.payload as {
              owner: string;
              repo: string;
              issueNumber: number;
              repoId: number;
            };

            try {
              const { getIssue } = await import('@/src/api/github');
              const { saveIssue } = await import('@/src/storage/db');

              // Fetch issue from GitHub
              const issue = await getIssue(owner, repo, issueNumber);

              // Create issue record
              const issueRecord = {
                ...issue,
                repo_id: repoId,
                last_fetched_at: Date.now(),
              };

              // Save to database
              await saveIssue(issueRecord);

              console.log(
                `[Background] Fetched and saved Issue #${issueNumber} for ${owner}/${repo}`,
              );
              sendResponse({ success: true, data: issueRecord });
            } catch (error) {
              console.error(`[Background] Failed to fetch Issue #${issueNumber}:`, error);
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch issue',
              });
            }
            break;
          }

          case MessageType.TOKEN_SAVED: {
            console.warn('[Background] Token saved - triggering initial sync...');
            try {
              await forceImport();
              console.warn('[Background] Initial sync after token save completed');
              sendResponse({ success: true });
            } catch (error) {
              console.error('[Background] Initial sync after token save failed:', error);
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : 'Sync failed',
              });
            }
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
