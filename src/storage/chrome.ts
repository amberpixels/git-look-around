/**
 * Storage utilities for securely managing extension data
 * Uses browser.storage.local for tokens and IndexedDB for cached data
 */

const STORAGE_KEYS = {
  GITHUB_TOKEN: 'github_token',
  SYNC_PREFERENCES: 'sync_preferences',
} as const;

/**
 * User preferences for what to sync
 */
export interface SyncPreferences {
  syncIssues: boolean;
  syncPullRequests: boolean;
}

/**
 * Save GitHub personal access token
 */
export async function saveGitHubToken(token: string): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.GITHUB_TOKEN]: token,
  });
}

/**
 * Get GitHub personal access token
 */
export async function getGitHubToken(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.GITHUB_TOKEN);
  return result[STORAGE_KEYS.GITHUB_TOKEN] || null;
}

/**
 * Remove GitHub personal access token
 */
export async function removeGitHubToken(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEYS.GITHUB_TOKEN);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getGitHubToken();
  return !!token;
}

/**
 * Get sync preferences (defaults: sync both issues and PRs)
 */
export async function getSyncPreferences(): Promise<SyncPreferences> {
  const result = await browser.storage.local.get(STORAGE_KEYS.SYNC_PREFERENCES);
  const prefs = result[STORAGE_KEYS.SYNC_PREFERENCES] as SyncPreferences | undefined;

  // Default: sync both
  return (
    prefs || {
      syncIssues: true,
      syncPullRequests: true,
    }
  );
}

/**
 * Save sync preferences
 */
export async function saveSyncPreferences(preferences: SyncPreferences): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.SYNC_PREFERENCES]: preferences,
  });
}
