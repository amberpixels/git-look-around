/**
 * Storage utilities for securely managing extension data
 */

const STORAGE_KEYS = {
  GITHUB_TOKEN: 'github_token',
} as const;

/**
 * Storage interface for GitHub authentication
 */
export interface StorageData {
  [STORAGE_KEYS.GITHUB_TOKEN]?: string;
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
