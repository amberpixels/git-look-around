import type { SearchResultItem } from './useUnifiedSearch';
import { debugLog } from '@/src/utils/debug';

// Only keep small caches - removed entity and search results caches to avoid quota issues
const FIRST_RESULT_KEY = 'git_look_around_first_result';
const CONTRIBUTORS_KEY = 'git_look_around_contributors';

export function useSearchCache() {
  /**
   * Load the cached first result (most recently visited item)
   * This is used for instant display when opening the palette
   */
  async function loadFirstResult(): Promise<SearchResultItem | null> {
    try {
      const result = await browser.storage.local.get(FIRST_RESULT_KEY);
      const json = result[FIRST_RESULT_KEY] as string | undefined;

      if (!json) {
        return null;
      }

      const parsed = JSON.parse(json);
      void debugLog('[SearchCache] Loaded cached first result:', parsed.title);

      return parsed;
    } catch (e) {
      console.error('[SearchCache] Failed to load first result cache', e);
      return null;
    }
  }

  /**
   * Save the first result to cache for instant display next time
   */
  async function saveFirstResult(result: SearchResultItem | null): Promise<void> {
    try {
      if (result) {
        void debugLog('[SearchCache] Saving first result:', result.title);
        const json = JSON.stringify(result);
        await browser.storage.local.set({ [FIRST_RESULT_KEY]: json });
      } else {
        await browser.storage.local.remove(FIRST_RESULT_KEY);
      }
    } catch (e) {
      console.error('[SearchCache] Failed to save first result cache', e);
    }
  }

  /**
   * Load cached contributors (top 2 other users)
   */
  async function loadContributors(): Promise<string[]> {
    try {
      const result = await browser.storage.local.get(CONTRIBUTORS_KEY);
      const json = result[CONTRIBUTORS_KEY] as string | undefined;

      if (!json) {
        return [];
      }

      const parsed = JSON.parse(json);
      void debugLog('[SearchCache] Loaded cached contributors:', parsed.length, 'users');
      return parsed;
    } catch (e) {
      console.error('[SearchCache] Failed to load contributors cache', e);
      return [];
    }
  }

  /**
   * Save contributors to cache
   */
  async function saveContributors(contributors: string[]): Promise<void> {
    try {
      const json = JSON.stringify(contributors);
      await browser.storage.local.set({ [CONTRIBUTORS_KEY]: json });
      void debugLog('[SearchCache] Saved contributors:', contributors.length, 'users');
    } catch (e) {
      console.error('[SearchCache] Failed to save contributors cache', e);
    }
  }

  /**
   * Clear first result cache (e.g., after a visit is recorded)
   */
  async function clearFirstResultCache(): Promise<void> {
    try {
      await browser.storage.local.remove(FIRST_RESULT_KEY);
      void debugLog('[SearchCache] Cleared first result cache');
    } catch (e) {
      console.error('[SearchCache] Failed to clear first result cache', e);
    }
  }

  return {
    loadFirstResult,
    saveFirstResult,
    loadContributors,
    saveContributors,
    clearFirstResultCache,
  };
}
