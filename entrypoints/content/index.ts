import { createApp } from 'vue';
import App from './App.vue';
import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import { debugWarn, initDebugMode } from '@/src/utils/debug';

/**
 * Detect what type of GitHub page we're on and record visit via background worker
 */
async function detectAndRecordVisit() {
  const path = window.location.pathname;

  // Match any page within a repo: /owner/repo or /owner/repo/anything
  // Excludes special GitHub pages like /settings, /notifications, /explore, etc.
  const repoMatch = path.match(/^\/([^/]+)\/([^/]+)/);

  // Skip if it's a special GitHub page (not a real repo)
  const specialPages = [
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
  ];

  if (repoMatch) {
    const [, owner, repo] = repoMatch;

    // Skip special pages
    if (specialPages.includes(owner)) {
      return;
    }

    const fullName = `${owner}/${repo}`;
    await debugWarn(`[Gitjump] On repo: ${fullName}`);

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
          await debugWarn(`[Gitjump] Recording visit to repo ${fullName} (ID: ${repoRecord.id})`);
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
              const pr = prsResponse.data.find((p: { number: number }) => p.number === prNumber);
              if (pr) {
                await debugWarn(`[Gitjump] Recording visit to PR #${prNumber} (ID: ${pr.id})`);
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
              const issue = issuesResponse.data.find(
                (i: { number: number }) => i.number === issueNumber,
              );
              if (issue) {
                await debugWarn(
                  `[Gitjump] Recording visit to Issue #${issueNumber} (ID: ${issue.id})`,
                );
                await browser.runtime.sendMessage({
                  type: MessageType.RECORD_VISIT,
                  payload: { type: 'issue', entityId: issue.id },
                });
              }
            }
          }

          await debugWarn(`[Gitjump] Visit recorded successfully`);
        } else {
          await debugWarn(
            `[Gitjump] Repo ${fullName} not in database yet, skipping visit tracking`,
          );
        }
      }
    } catch (error) {
      console.error('[Gitjump] Failed to record visit:', error);
    }
  }
}

export default defineContentScript({
  matches: ['*://github.com/*', '*://*.github.com/*'],
  async main(_ctx) {
    // Initialize debug mode cache
    await initDebugMode();
    await debugWarn('[Gitjump] Content script loaded on GitHub');

    // Create container for Vue app
    const container = document.createElement('div');
    container.id = 'gitjump-root';
    document.body.appendChild(container);

    // Mount Vue app
    const app = createApp(App);
    const vm = app.mount(container) as InstanceType<typeof App>;

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === MessageType.TOGGLE_OVERLAY) {
        vm.toggle();
      }
    });

    // Track visit when page loads
    detectAndRecordVisit().catch((err) => {
      console.error('[Gitjump] Failed to record visit:', err);
    });

    // Track visits on navigation (GitHub uses pushState for navigation)
    let lastPath = window.location.pathname;
    const observer = new window.MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        detectAndRecordVisit().catch((err) => {
          console.error('[Gitjump] Failed to record visit:', err);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },
});
