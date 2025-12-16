/**
 * Debug logger utility that respects user's debug mode preference
 */

import { getImportPreferences } from '@/src/storage/chrome';

let debugEnabled: boolean | null = null;
let lastChecked = 0;
const CACHE_DURATION = 5000; // Cache for 5 seconds to avoid excessive storage reads

/**
 * Check if debug mode is enabled (with caching)
 */
async function isDebugEnabled(): Promise<boolean> {
  const now = Date.now();

  // Return cached value if still valid
  if (debugEnabled !== null && now - lastChecked < CACHE_DURATION) {
    return debugEnabled;
  }

  // Fetch fresh value
  try {
    const prefs = await getImportPreferences();
    debugEnabled = prefs.debugMode;
    lastChecked = now;
    return debugEnabled;
  } catch {
    // If we can't read preferences, don't log (fail silently)
    return false;
  }
}

/**
 * Log to console only if debug mode is enabled
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function debugLog(...args: any[]): Promise<void> {
  if (await isDebugEnabled()) {
    console.log(...args);
  }
}

/**
 * Warn to console only if debug mode is enabled
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function debugWarn(...args: any[]): Promise<void> {
  if (await isDebugEnabled()) {
    console.warn(...args);
  }
}

/**
 * Error to console (always shown, regardless of debug mode)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debugError(...args: any[]): void {
  console.error(...args);
}

/**
 * Synchronous version that uses cached value (use when async not possible)
 * Note: This may return false on first call before cache is populated
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debugLogSync(...args: any[]): void {
  if (debugEnabled === true) {
    console.log(...args);
  }
}

/**
 * Synchronous warn version
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debugWarnSync(...args: any[]): void {
  if (debugEnabled === true) {
    console.warn(...args);
  }
}

/**
 * Initialize debug mode cache (call this early in your app)
 */
export async function initDebugMode(): Promise<void> {
  await isDebugEnabled();
}
