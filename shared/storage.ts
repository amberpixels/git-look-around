/**
 * Storage utilities for securely managing extension data
 */

import type { GitHubRepo } from './github-api';

const STORAGE_KEYS = {
  GITHUB_TOKEN: 'github_token',
  REPOS_CACHE: 'repos_cache',
  REPOS_CACHE_TIMESTAMP: 'repos_cache_timestamp',
} as const;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Storage interface for GitHub authentication and caching
 */
export interface StorageData {
  [STORAGE_KEYS.GITHUB_TOKEN]?: string;
  [STORAGE_KEYS.REPOS_CACHE]?: GitHubRepo[];
  [STORAGE_KEYS.REPOS_CACHE_TIMESTAMP]?: number;
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
 * Save repos to cache
 */
export async function saveReposCache(repos: GitHubRepo[]): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.REPOS_CACHE]: repos,
    [STORAGE_KEYS.REPOS_CACHE_TIMESTAMP]: Date.now(),
  });
}

/**
 * Get repos from cache
 */
export async function getReposCache(): Promise<GitHubRepo[] | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.REPOS_CACHE);
  return result[STORAGE_KEYS.REPOS_CACHE] || null;
}

/**
 * Check if repos cache is still valid (not expired)
 */
export async function isCacheValid(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEYS.REPOS_CACHE_TIMESTAMP);
  const timestamp = result[STORAGE_KEYS.REPOS_CACHE_TIMESTAMP];

  if (!timestamp) {
    return false;
  }

  return Date.now() - timestamp < CACHE_TTL_MS;
}

/**
 * Clear repos cache
 */
export async function clearReposCache(): Promise<void> {
  await browser.storage.local.remove([
    STORAGE_KEYS.REPOS_CACHE,
    STORAGE_KEYS.REPOS_CACHE_TIMESTAMP,
  ]);
}
