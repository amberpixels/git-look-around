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
import type { SearchableEntity } from '@/src/composables/useUnifiedSearch';

export default defineBackground(() => {
  console.warn('[Background] Gitjump background initialized', { id: browser.runtime.id });

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
            const { query, currentUsername } = message.payload as {
              query: string;
              currentUsername?: string;
            };

            // Get all repos
            const repos = await getAllRepos();

            // Filter to indexed repos only
            const indexedRepos = repos.filter((repo) => repo.indexed);

            // Build SearchableEntity array
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

            sendResponse({ success: true, data: results });
            break;
          }

          case MessageType.DEBUG_SEARCH: {
            const { query, currentUsername } = message.payload as {
              query: string;
              currentUsername?: string;
            };

            // Get all repos
            const repos = await getAllRepos();

            // Filter to indexed repos only
            const indexedRepos = repos.filter((repo) => repo.indexed);

            // Build SearchableEntity array
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

            sendResponse({ success: true, data: debugResults });
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
