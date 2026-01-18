import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import {
  runImport,
  getImportStatus,
  updateImportStatus,
  forceImport,
  forceSyncSingleRepo,
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
import { debugLog } from '@/src/utils/debug';

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
  console.warn('[Background] Git Look-Around background initialized', { id: browser.runtime.id });

  // Initialize search cache (only small caches - first/second result and contributors)
  const { saveFirstResult, saveSecondResult, saveContributors, clearFirstResultCache } =
    useSearchCache();

  // Throttle for sync progress updates (max once per 2 seconds)
  let lastSyncProgressUpdate = 0;
  const SYNC_PROGRESS_THROTTLE_MS = 2000;

  /**
   * Handle import progress events - clear cache and notify tabs
   */
  async function handleImportProgress(event: 'repos_saved' | 'repo_processed') {
    const now = Date.now();

    // Throttle updates to avoid spamming (except for repos_saved which is important)
    if (event === 'repo_processed' && now - lastSyncProgressUpdate < SYNC_PROGRESS_THROTTLE_MS) {
      return;
    }

    lastSyncProgressUpdate = now;

    void debugLog(`[Background] Import progress: ${event} - notifying tabs to refresh`);

    // Clear first result cache (small cache for instant display)
    await clearFirstResultCache();

    // Notify all tabs to refresh (without sending results - let them re-fetch)
    browser.tabs.query({}).then((tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          browser.tabs
            .sendMessage(tab.id, {
              type: MessageType.CACHE_UPDATED,
              payload: null, // Let content script re-fetch
            })
            .catch(() => {
              // Tab might not have content script, ignore
            });
        }
      });
    });
  }

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
      await runImport(handleImportProgress);
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
            const payload = message.payload as { repoName?: string } | undefined;
            if (payload?.repoName) {
              // Single repo sync
              await forceSyncSingleRepo(payload.repoName, handleImportProgress);
            } else {
              // Full sync
              await forceImport(handleImportProgress);
            }
            sendResponse({ success: true });
            break;
          }

          case MessageType.RECORD_VISIT: {
            const { type, entityId } = message.payload as {
              type: 'repo' | 'issue' | 'pr';
              entityId: number;
            };
            await recordVisit(type, entityId);
            // Clear first result cache
            await clearFirstResultCache();
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
            const {
              query,
              currentUsername,
              currentRepoName: _currentRepoName,
            } = message.payload as {
              query: string;
              currentUsername?: string;
              currentRepoName?: string | null;
            };

            // Always build fresh from IndexedDB - no more stale cache issues!
            const repos = await getAllRepos();
            const indexedRepos = repos.filter((repo) => repo.indexed);

            const entities: SearchableEntity[] = await Promise.all(
              indexedRepos.map(async (repo) => {
                const [issues, prs] = await Promise.all([
                  getIssuesByRepo(repo.id),
                  getPullRequestsByRepo(repo.id),
                ]);
                return { repo, issues, prs };
              }),
            );

            // Use useUnifiedSearch to get sorted results
            const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
            await setEntities(entities);
            const results = searchResults.value(query);

            // Save small caches for instant display (only for empty query)
            // Cache top 2 results (for quick-switcher - frontend chooses based on current repo)
            if (!query && results.length > 0) {
              if (results[0]) {
                await saveFirstResult(results[0]);
              }
              if (results[1]) {
                await saveSecondResult(results[1]);
              }
              const contributors = extractContributors(results, currentUsername);
              await saveContributors(contributors);
            }

            sendResponse({ success: true, data: results });
            break;
          }

          case MessageType.DEBUG_SEARCH: {
            const {
              query,
              currentUsername,
              currentRepoName: _currentRepoName,
            } = message.payload as {
              query: string;
              currentUsername?: string;
              currentRepoName?: string | null;
            };

            // Always build fresh from IndexedDB - no more stale cache issues!
            const repos = await getAllRepos();
            const indexedRepos = repos.filter((repo) => repo.indexed);

            const entities: SearchableEntity[] = await Promise.all(
              indexedRepos.map(async (repo) => {
                const [issues, prs] = await Promise.all([
                  getIssuesByRepo(repo.id),
                  getPullRequestsByRepo(repo.id),
                ]);
                return { repo, issues, prs };
              }),
            );

            // Use useUnifiedSearch to get sorted results
            const { searchResults, setEntities } = useUnifiedSearch(currentUsername);
            await setEntities(entities);
            const results = searchResults.value(query);

            // Save small caches for instant display (only for empty query)
            // Cache top 2 results (for quick-switcher - frontend chooses based on current repo)
            if (!query && results.length > 0) {
              if (results[0]) {
                await saveFirstResult(results[0]);
              }
              if (results[1]) {
                await saveSecondResult(results[1]);
              }
              const contributors = extractContributors(results, currentUsername);
              await saveContributors(contributors);
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

            sendResponse({ success: true, data: debugResults });
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

              void debugLog(`[Background] Fetched and saved PR #${prNumber} for ${owner}/${repo}`);
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

              void debugLog(
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
              await forceImport(handleImportProgress);
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

          case MessageType.OPEN_OPTIONS_PAGE: {
            await browser.runtime.openOptionsPage();
            sendResponse({ success: true });
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
