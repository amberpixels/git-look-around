/**
 * Content script for GitHub token creation page
 * Pre-selects required scopes and adds visual hints
 */

import { waitForPageReady } from './github-token-helper/dom-utils';
import { highlightScopes } from './github-token-helper/scope-highlighter';

// Required scopes for the extension
const REQUIRED_SCOPES = ['repo', 'read:user', 'read:org'];

// Inject CSS styles
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .git-look-around-banner {
      background: #0969da !important;
      color: white !important;
      padding: 16px !important;
      margin: 16px 0 !important;
      border-radius: 6px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      min-height: 52px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    .git-look-around-banner.warning {
      background: #d29922 !important;
    }

    .git-look-around-banner svg {
      flex-shrink: 0 !important;
    }

    .git-look-around-highlight {
      outline: 3px solid #0969da !important;
      outline-offset: 4px !important;
      border-radius: 6px !important;
      animation: pulse-highlight 2s ease-in-out infinite !important;
    }

    @keyframes pulse-highlight {
      0%, 100% {
        outline-color: #0969da;
      }
      50% {
        outline-color: #54aeff;
      }
    }
  `;
  document.head.appendChild(style);
}

export default defineContentScript({
  matches: ['*://github.com/settings/tokens/new*'],
  async main() {
    // Check if we're coming from our extension
    const urlParams = new URLSearchParams(window.location.search);
    const fromExtension = urlParams.get('from') === 'git-look-around';

    if (!fromExtension) {
      return;
    }

    // Inject styles
    injectStyles();

    // Wait for page to be ready
    await waitForPageReady();

    // Highlight and check required scopes
    highlightScopes(REQUIRED_SCOPES);
  },
});
