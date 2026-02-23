import { createApp } from 'vue';
import App from './App.vue';
import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import type { SearchResultItem } from '@/src/composables/useUnifiedSearch';
import { debugWarn, initDebugMode } from '@/src/utils/debug';

/**
 * Detect what type of GitHub page we're on and record visit via background worker
 */
async function detectAndRecordVisit() {
  const path = window.location.pathname;

  // Match any page within a repo: /owner/repo or /owner/repo/anything
  // Excludes special GitHub pages like /settings, /notifications, /explore, etc.
  const repoMatch = path.match(/^\/([^/]+)\/([^/]+)/);

  if (!repoMatch) {
    return;
  }

  const [, owner, repo] = repoMatch;

  // Skip if it's a special GitHub page
  if (
    [
      'settings',
      'notifications',
      'explore',
      'trending',
      'collections',
      'events',
      'sponsors',
      'login',
      'signup',
      'pricing',
      'features',
      'enterprise',
      'team',
      'about',
      'contact',
      'security',
      'site',
    ].includes(owner)
  ) {
    return;
  }

  const fullName = `${owner}/${repo}`;
  await debugWarn(`[Git Look-Around] On repo: ${fullName}`);

  // Check if we're on a PR or Issue page
  const prMatch = path.match(/^\/[^/]+\/[^/]+\/pull\/(\d+)/);
  const issueMatch = path.match(/^\/[^/]+\/[^/]+\/issues\/(\d+)/);

  // Ask background worker for all repos to find the ID
  try {
    const response = await browser.runtime.sendMessage({
      type: MessageType.GET_ALL_REPOS,
    });

    if (response.success && response.data) {
      const repos = response.data;
      const repoRecord = repos.find((r: { full_name: string }) => r.full_name === fullName);

      if (repoRecord) {
        // Always record repo visit
        await debugWarn(
          `[Git Look-Around] Recording visit to repo ${fullName} (ID: ${repoRecord.id})`,
        );
        await browser.runtime.sendMessage({
          type: MessageType.RECORD_VISIT,
          payload: { type: 'repo', entityId: repoRecord.id },
        });

        // If on PR page, also record PR visit
        if (prMatch) {
          const prNumber = parseInt(prMatch[1], 10);
          const prsResponse = await browser.runtime.sendMessage({
            type: MessageType.GET_PRS_BY_REPO,
            payload: repoRecord.id,
          });

          if (prsResponse.success && prsResponse.data) {
            let pr = prsResponse.data.find((p: { number: number }) => p.number === prNumber);

            // If PR not found in database, fetch it on-demand
            if (!pr) {
              await debugWarn(
                `[Git Look-Around] PR #${prNumber} not in database, fetching on-demand`,
              );
              const fetchResponse = await browser.runtime.sendMessage({
                type: MessageType.FETCH_AND_SAVE_PR,
                payload: { owner, repo, prNumber, repoId: repoRecord.id },
              });

              if (fetchResponse.success && fetchResponse.data) {
                pr = fetchResponse.data;
              }
            }

            if (pr) {
              await debugWarn(
                `[Git Look-Around] Recording visit to PR #${prNumber} (ID: ${pr.id})`,
              );
              await browser.runtime.sendMessage({
                type: MessageType.RECORD_VISIT,
                payload: { type: 'pr', entityId: pr.id },
              });
            }
          }
        }

        // If on Issue page, also record Issue visit
        if (issueMatch) {
          const issueNumber = parseInt(issueMatch[1], 10);
          const issuesResponse = await browser.runtime.sendMessage({
            type: MessageType.GET_ISSUES_BY_REPO,
            payload: repoRecord.id,
          });

          if (issuesResponse.success && issuesResponse.data) {
            let issue = issuesResponse.data.find(
              (i: { number: number }) => i.number === issueNumber,
            );

            // If issue not found in database, fetch it on-demand
            if (!issue) {
              await debugWarn(
                `[Git Look-Around] Issue #${issueNumber} not in database, fetching on-demand`,
              );
              const fetchResponse = await browser.runtime.sendMessage({
                type: MessageType.FETCH_AND_SAVE_ISSUE,
                payload: { owner, repo, issueNumber, repoId: repoRecord.id },
              });

              if (fetchResponse.success && fetchResponse.data) {
                issue = fetchResponse.data;
              }
            }

            if (issue) {
              await debugWarn(
                `[Git Look-Around] Recording visit to Issue #${issueNumber} (ID: ${issue.id})`,
              );
              await browser.runtime.sendMessage({
                type: MessageType.RECORD_VISIT,
                payload: { type: 'issue', entityId: issue.id },
              });
            }
          }
        }

        await debugWarn(`[Git Look-Around] Visit recorded successfully`);
      } else {
        await debugWarn(
          `[Git Look-Around] Repo ${fullName} not in database yet, skipping visit tracking`,
        );
      }
    }
  } catch (error) {
    console.error('[Git Look-Around] Failed to record visit:', error);
  }
}

function isGitHubHost(hostname: string): boolean {
  return hostname === 'github.com' || hostname.endsWith('.github.com');
}

/**
 * Normalize a user-entered host pattern:
 *   "https://www.notion.so/some/path" → "www.notion.so"
 *   "notion.so"                       → "notion.so"
 *   "localhost:3000/*"                → "localhost:3000"
 */
function normalizeHostPattern(raw: string): string {
  let p = raw.trim();
  p = p.replace(/^https?:\/\//, '');
  p = p.replace(/\/.*$/, '');
  return p;
}

/**
 * Match a user-entered pattern against the current page's host.
 *
 * Rules (no implicit subdomain matching):
 *   "notion.so"       → exact match on notion.so only
 *   "*.notion.so"     → any subdomain of notion.so (not bare notion.so)
 *   "localhost:3000"  → exact match including port
 */
function matchesHostPattern(raw: string, hostname: string, host: string): boolean {
  const pattern = normalizeHostPattern(raw);
  if (!pattern) return false;

  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]+');
  const regex = new RegExp(`^${regexStr}$`);

  // Try host (with port) first, then hostname (without port)
  return regex.test(host) || regex.test(hostname);
}

export default defineContentScript({
  matches: ['*://*/*'], // Match all sites initially, will filter in main()
  async main(_ctx) {
    // Check if we should run on this page based on user preferences
    const { getHotkeyPreferences } = await import('@/src/storage/chrome');
    const hotkeyPrefs = await getHotkeyPreferences();

    const currentHost = window.location.host; // includes port if non-standard
    const currentHostname = window.location.hostname;
    let shouldRun = false;

    if (hotkeyPrefs.mode === 'github-only') {
      shouldRun = isGitHubHost(currentHostname);
    } else if (hotkeyPrefs.mode === 'custom-hosts') {
      shouldRun =
        isGitHubHost(currentHostname) ||
        hotkeyPrefs.customHosts.some((pattern) =>
          matchesHostPattern(pattern, currentHostname, currentHost),
        );
    }

    if (!shouldRun) {
      await debugWarn(`[Git Look-Around] Skipping initialization on ${currentHost}`);
      return;
    }

    // Initialize debug mode cache
    await initDebugMode();
    await debugWarn('[Git Look-Around] Content script loaded on GitHub');

    // Create container for Vue app
    const container = document.createElement('div');
    container.id = 'git-look-around-root';
    document.body.appendChild(container);

    // Mount Vue app
    const app = createApp(App);
    const vm = app.mount(container) as InstanceType<typeof App>;

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === MessageType.TOGGLE_OVERLAY) {
        vm.toggle();
      } else if (message.type === MessageType.CACHE_UPDATED) {
        vm.handleCacheUpdate(message.payload as SearchResultItem[]);
      }
    });

    // Track visit when page loads
    detectAndRecordVisit().catch((err) => {
      console.error('[Git Look-Around] Failed to record visit:', err);
    });

    // Track visits on navigation (GitHub uses pushState for navigation)
    let lastPath = window.location.pathname;
    const observer = new window.MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        detectAndRecordVisit().catch((err) => {
          console.error('[Git Look-Around] Failed to record visit:', err);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },
});
