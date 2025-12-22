/**
 * Storage utilities for securely managing extension data
 * Uses browser.storage.local for tokens and IndexedDB for cached data
 */

const STORAGE_KEYS = {
  GITHUB_TOKEN: 'github_token',
  IMPORT_PREFERENCES: 'import_preferences',
  THEME_CACHE: 'theme_cache',
  HOTKEY_PREFERENCES: 'hotkey_preferences',
  DEBUG_MODE: 'debug_mode',
  ORG_FILTER_PREFERENCES: 'org_filter_preferences',
} as const;

/**
 * User preferences for what to import
 */
export interface ImportPreferences {
  importIssues: boolean;
  importPullRequests: boolean;
}

/**
 * User preferences for keyboard shortcuts
 */
export type HotkeyMode = 'github-only' | 'custom-hosts';

export interface HotkeyPreferences {
  mode: HotkeyMode;
  customHosts: string[]; // List of custom host patterns like "example.com", "*.mycompany.com"
}

/**
 * Organization filter preferences
 * Maps organization name to enabled status
 * Special key "__personal__" represents non-organization (personal) repos
 */
export interface OrgFilterPreferences {
  enabledOrgs: Record<string, boolean>; // { "my-company": true, "other-org": false, "__personal__": true }
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
 * Get import preferences (defaults: import both issues and PRs)
 */
export async function getImportPreferences(): Promise<ImportPreferences> {
  const result = await browser.storage.local.get(STORAGE_KEYS.IMPORT_PREFERENCES);
  const prefs = result[STORAGE_KEYS.IMPORT_PREFERENCES] as ImportPreferences | undefined;

  // Default: import both
  return {
    importIssues: prefs?.importIssues ?? true,
    importPullRequests: prefs?.importPullRequests ?? true,
  };
}

/**
 * Save import preferences
 */
export async function saveImportPreferences(preferences: ImportPreferences): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.IMPORT_PREFERENCES]: preferences,
  });
}

/**
 * Get hotkey preferences (defaults: only on GitHub sites)
 */
export async function getHotkeyPreferences(): Promise<HotkeyPreferences> {
  const result = await browser.storage.local.get(STORAGE_KEYS.HOTKEY_PREFERENCES);
  const prefs = result[STORAGE_KEYS.HOTKEY_PREFERENCES] as HotkeyPreferences | undefined;

  // Ensure customHosts is always an array (handle object with numeric keys)
  let customHosts: string[] = [];
  if (prefs?.customHosts) {
    if (Array.isArray(prefs.customHosts)) {
      customHosts = prefs.customHosts;
    } else if (typeof prefs.customHosts === 'object') {
      // Convert object with numeric keys to array
      customHosts = Object.values(prefs.customHosts);
    }
  }

  return {
    mode: prefs?.mode ?? 'github-only',
    customHosts,
  };
}

/**
 * Save hotkey preferences
 */
export async function saveHotkeyPreferences(preferences: HotkeyPreferences): Promise<void> {
  // Ensure customHosts is stored as a proper array
  const toSave: HotkeyPreferences = {
    mode: preferences.mode,
    customHosts: Array.isArray(preferences.customHosts)
      ? [...preferences.customHosts]
      : Object.values(preferences.customHosts || {}),
  };

  await browser.storage.local.set({
    [STORAGE_KEYS.HOTKEY_PREFERENCES]: toSave,
  });
}

/**
 * Get debug mode flag
 */
export async function getDebugMode(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEYS.DEBUG_MODE);
  return result[STORAGE_KEYS.DEBUG_MODE] ?? false;
}

/**
 * Save debug mode flag
 */
export async function saveDebugMode(enabled: boolean): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.DEBUG_MODE]: enabled,
  });
}

/**
 * Get organization filter preferences
 * Default: all organizations enabled
 */
export async function getOrgFilterPreferences(): Promise<OrgFilterPreferences> {
  const result = await browser.storage.local.get(STORAGE_KEYS.ORG_FILTER_PREFERENCES);
  const prefs = result[STORAGE_KEYS.ORG_FILTER_PREFERENCES] as OrgFilterPreferences | undefined;

  // Default: empty (all orgs enabled)
  return {
    enabledOrgs: prefs?.enabledOrgs ?? {},
  };
}

/**
 * Save organization filter preferences
 */
export async function saveOrgFilterPreferences(preferences: OrgFilterPreferences): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.ORG_FILTER_PREFERENCES]: preferences,
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
