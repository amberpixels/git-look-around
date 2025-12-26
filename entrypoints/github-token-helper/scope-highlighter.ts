/**
 * Scope highlighting and checkbox management
 */

import { findCheckbox } from './dom-utils';

/**
 * Highlight required scopes and check their checkboxes
 * Returns true if all required scopes are checked
 */
export function highlightScopes(requiredScopes: string[]): boolean {
  let allChecked = true;

  requiredScopes.forEach((scopeName) => {
    const checkbox = findCheckbox(scopeName);

    if (checkbox) {
      // Pre-check the checkbox
      if (!checkbox.checked) {
        checkbox.checked = true;
        // Trigger change event in case there are listeners
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Find the parent label/container and add highlight
      const label = checkbox.closest('.form-checkbox') || checkbox.closest('dt');

      if (label) {
        label.classList.add('git-look-around-highlight');
      }
    } else {
      allChecked = false;
    }
  });

  return allChecked;
}

/**
 * Check if all required scopes are currently checked
 */
export function areAllScopesChecked(requiredScopes: string[]): boolean {
  return requiredScopes.every((scopeName) => {
    const checkbox = findCheckbox(scopeName);
    return checkbox?.checked || false;
  });
}
