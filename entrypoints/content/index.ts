import { createApp } from 'vue';
import App from './App.vue';
import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';

/**
 * Detect what type of GitHub page we're on and record visit via background worker
 */
async function detectAndRecordVisit() {
  const path = window.location.pathname;

  // Match patterns:
  // Repo: /owner/repo
  // Issue: /owner/repo/issues/123
  // PR: /owner/repo/pull/123

  const repoMatch = path.match(/^\/([^/]+)\/([^/]+)\/?$/);
  const issueMatch = path.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  const prMatch = path.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);

  if (issueMatch) {
    // Issue page - need to get issue ID from DOM/API
    const [, owner, repo, issueNumber] = issueMatch;
    console.warn(`[Gitjump] On issue: ${owner}/${repo}#${issueNumber}`);
    // TODO: We need to get the actual GitHub issue ID, not just the number
    // For now, skip until we implement a mapping or fetch from API
  } else if (prMatch) {
    // PR page - need to get PR ID from DOM/API
    const [, owner, repo, prNumber] = prMatch;
    console.warn(`[Gitjump] On PR: ${owner}/${repo}#${prNumber}`);
    // TODO: Same as above
  } else if (repoMatch) {
    // Repository page
    const [, owner, repo] = repoMatch;
    const fullName = `${owner}/${repo}`;
    console.warn(`[Gitjump] On repo: ${fullName}`);

    // Ask background worker for all repos to find the ID
    try {
      const response = await browser.runtime.sendMessage({
        type: MessageType.GET_ALL_REPOS,
      });

      if (response.success && response.data) {
        const repos = response.data;
        const repoRecord = repos.find((r: { full_name: string }) => r.full_name === fullName);

        if (repoRecord) {
          console.warn(`[Gitjump] Recording visit to repo ${fullName} (ID: ${repoRecord.id})`);

          // Send visit event to background worker
          await browser.runtime.sendMessage({
            type: MessageType.RECORD_VISIT,
            payload: { type: 'repo', entityId: repoRecord.id },
          });

          console.warn(`[Gitjump] Visit recorded successfully`);
        } else {
          console.warn(`[Gitjump] Repo ${fullName} not in database yet, skipping visit tracking`);
        }
      }
    } catch (error) {
      console.error('[Gitjump] Failed to record visit:', error);
    }
  }
}

export default defineContentScript({
  matches: ['*://github.com/*', '*://*.github.com/*'],
  main(_ctx) {
    console.warn('[Gitjump] Content script loaded on GitHub');

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
