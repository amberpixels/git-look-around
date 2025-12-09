/**
 * Storage utilities for securely managing extension data
 * Uses browser.storage.local for tokens and IndexedDB for cached data
 */

const STORAGE_KEYS = {
  GITHUB_TOKEN: 'github_token',
  SYNC_PREFERENCES: 'sync_preferences',
  THEME_CACHE: 'theme_cache',
} as const;

/**
 * User preferences for what to sync
 */
export interface SyncPreferences {
  syncIssues: boolean;
  syncPullRequests: boolean;
  debugMode: boolean;
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

  // Default: sync both, debug mode off
  return {
    syncIssues: prefs?.syncIssues ?? true,
    syncPullRequests: prefs?.syncPullRequests ?? true,
    debugMode: prefs?.debugMode ?? false,
  };
}

/**
 * Save sync preferences
 */
export async function saveSyncPreferences(preferences: SyncPreferences): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.SYNC_PREFERENCES]: preferences,
  });
}

/**
 * Theme cache for instant theme application
 * Stored separately per GitHub page to handle user switching between light/dark on different repos
 */
export type ThemeMode = 'light' | 'dark';

export interface ThemeCache {
  mode: ThemeMode;
  timestamp: number; // When theme was cached
}

/**
 * Get cached theme (instant, synchronous-like access)
 * Returns null if no cache or cache is stale (> 7 days old)
 */
export async function getCachedTheme(): Promise<ThemeMode | null> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.THEME_CACHE);
    const cache = result[STORAGE_KEYS.THEME_CACHE] as ThemeCache | undefined;

    if (!cache) {
      return null;
    }

    // Invalidate cache after 7 days to ensure we pick up theme changes
    const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    const age = Date.now() - cache.timestamp;

    if (age > CACHE_MAX_AGE) {
      return null;
    }

    return cache.mode;
  } catch (error) {
    console.error('[Storage] Error reading theme cache:', error);
    return null;
  }
}

/**
 * Save theme to cache for instant loading on next page
 */
export async function setCachedTheme(mode: ThemeMode): Promise<void> {
  try {
    const cache: ThemeCache = {
      mode,
      timestamp: Date.now(),
    };

    await browser.storage.local.set({
      [STORAGE_KEYS.THEME_CACHE]: cache,
    });
  } catch (error) {
    console.error('[Storage] Error saving theme cache:', error);
  }
}
