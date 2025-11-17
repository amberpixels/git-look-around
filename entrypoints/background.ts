import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import { runSync, getSyncStatus, forceSync } from '@/src/sync/engine';
import { getLastRateLimit } from '@/src/api/github';
import { getAllRepos, getIssuesByRepo, getPullRequestsByRepo, recordVisit } from '@/src/storage/db';

export default defineBackground(() => {
  console.warn('[Background] Gitjump background initialized', { id: browser.runtime.id });

  // Run initial sync when extension loads
  runSync().catch((err) => {
    console.error('[Background] Initial sync failed:', err);
  });

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
