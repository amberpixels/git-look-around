/**
 * DOM utility functions for GitHub token helper
 */

/**
 * Wait for checkboxes to appear on the page
 */
export function waitForPageReady(): Promise<void> {
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
}

/**
 * Find a checkbox for a given scope name
 * Tries multiple selectors to handle different GitHub page structures
 */
export function findCheckbox(scopeName: string): HTMLInputElement | null {
  // Try standard selector
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

  return checkbox;
}

/**
 * Find the form element on the page
 */
export function findForm(): HTMLFormElement | null {
  return document.querySelector('form');
}
