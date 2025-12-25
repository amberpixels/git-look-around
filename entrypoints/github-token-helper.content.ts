/**
 * Content script for GitHub token creation page
 * Pre-selects required scopes and adds visual hints
 */

export default defineContentScript({
  matches: ['*://github.com/settings/tokens/new*'],
  async main() {
    // Check if we're coming from our extension
    const urlParams = new URLSearchParams(window.location.search);
    const fromExtension = urlParams.get('from') === 'git-look-around';

    if (!fromExtension) {
      return;
    }

    // Required scopes for the extension
    const REQUIRED_SCOPES = ['repo', 'read:user', 'read:org'];

    // Wait for the page to load
    const checkPageReady = () => {
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          const scopeCheckboxes = document.querySelectorAll('input[type="checkbox"]');
          if (scopeCheckboxes.length > 0) {
            clearInterval(interval);
            resolve();
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 10000);
      });
    };

    await checkPageReady();

    // Inject styles for visual hints
    const style = document.createElement('style');
    style.textContent = `
      .git-look-around-banner {
        background: #0969da;
        color: white;
        padding: 16px;
        margin: 16px 0;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .git-look-around-banner.warning {
        background: #d29922;
      }

      .git-look-around-banner svg {
        flex-shrink: 0;
      }

      .git-look-around-highlight {
        outline: 3px solid #0969da !important;
        outline-offset: 4px;
        border-radius: 6px;
        animation: pulse-highlight 2s ease-in-out infinite;
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

    // Add banner at the top of the form
    const addBanner = (allChecked: boolean) => {
      const existingBanner = document.querySelector('.git-look-around-banner');
      if (existingBanner) {
        existingBanner.remove();
      }

      const form = document.querySelector('form');
      if (!form) return;

      const banner = document.createElement('div');
      banner.className = `git-look-around-banner ${allChecked ? '' : 'warning'}`;

      const icon = allChecked
        ? '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"></path></svg>'
        : '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>';

      const message = allChecked
        ? 'All required permissions for git-look-around are selected below ✓'
        : 'Some required permissions are not selected - functionality will be limited';

      banner.innerHTML = `${icon}<span>${message}</span>`;

      // Insert banner before the form or at the top of the form
      const insertPoint = form.querySelector('.form-group') || form.firstElementChild;
      if (insertPoint) {
        form.insertBefore(banner, insertPoint);
      }
    };

    // Find and highlight required scopes
    const highlightScopes = () => {
      let allChecked = true;

      REQUIRED_SCOPES.forEach((scopeName) => {
        // Try multiple selectors for finding the checkbox
        let checkbox = document.querySelector(
          `input[type="checkbox"][name="oauth_access[scopes][]"][value="${scopeName}"]`,
        ) as HTMLInputElement;

        // Try alternative selector
        if (!checkbox) {
          checkbox = document.querySelector(
            `input[type="checkbox"][value="${scopeName}"]`,
          ) as HTMLInputElement;
        }

        // Try by ID
        if (!checkbox) {
          checkbox = document.getElementById(scopeName) as HTMLInputElement;
        }

        if (checkbox) {
          // Pre-check the checkbox
          if (!checkbox.checked) {
            checkbox.checked = true;
            // Trigger change event in case there are listeners
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Find the parent label/container
          const label = checkbox.closest('.form-checkbox') || checkbox.closest('dt');

          if (label) {
            // Add highlight class
            label.classList.add('git-look-around-highlight');
          }
        } else {
          allChecked = false;
        }
      });

      return allChecked;
    };

    // Initial highlight
    const allChecked = highlightScopes();
    addBanner(allChecked);

    // Watch for checkbox changes to update banner
    const form = document.querySelector('form');
    if (form) {
      form.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'checkbox' && target.name?.includes('scope')) {
          // Check if all required scopes are still checked
          const allStillChecked = REQUIRED_SCOPES.every((scopeName) => {
            const cb = document.querySelector(
              `input[type="checkbox"][name="oauth_access[scopes][]"][value="${scopeName}"]`,
            ) as HTMLInputElement;
            return cb?.checked || false;
          });

          addBanner(allStillChecked);
        }
      });
    }
  },
});
