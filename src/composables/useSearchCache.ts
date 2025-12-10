import { ref } from 'vue';
import type { SearchableEntity, SearchResultItem } from './useUnifiedSearch';

const CACHE_KEY = 'gitjump_search_entities';
const FIRST_RESULT_KEY = 'gitjump_first_result';
const RESULTS_CACHE_KEY = 'gitjump_search_results';
const CONTRIBUTORS_KEY = 'gitjump_contributors';

export function useSearchCache() {
  const cachedString = ref<string | null>(null);

  /**
   * Load entities from browser storage
   */
  async function loadCache(): Promise<SearchableEntity[] | null> {
    try {
      const result = await browser.storage.local.get(CACHE_KEY);
      const json = result[CACHE_KEY] as string | undefined;
      if (!json) return null;

      cachedString.value = json;
      return JSON.parse(json);
    } catch (e) {
      console.error('[Gitjump] Failed to load search cache', e);
      return null;
    }
  }

  /**
   * Save entities to browser storage
   * Returns true if data was different from cache (and thus UI should update)
   * even if saving to storage failed
   */
  async function saveCache(entities: SearchableEntity[]): Promise<boolean> {
    let json: string;
    try {
      json = JSON.stringify(entities);
    } catch (e) {
      console.error('[Gitjump] Failed to stringify entities', e);
      // If we can't stringify, we can't compare.
      // Assume it's new data and return true so UI updates.
      return true;
    }

    // If data hasn't changed, don't update storage or return true
    if (json === cachedString.value) {
      return false;
    }

    // Update in-memory reference immediately so subsequent checks work
    cachedString.value = json;

    try {
      await browser.storage.local.set({ [CACHE_KEY]: json });
    } catch (e) {
      console.error('[Gitjump] Failed to save search cache (likely quota exceeded)', e);
      // Return true because data CHANGED, even if we couldn't persist it
      return true;
    }

    return true;
  }

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
      console.log('[SearchCache] Loaded cached first result:', parsed.title);

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
        console.log('[SearchCache] Saving first result:', result.title);
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
   * Load cached search results (full processed list)
   */
  async function loadSearchResults(): Promise<SearchResultItem[] | null> {
    try {
      const result = await browser.storage.local.get(RESULTS_CACHE_KEY);
      const json = result[RESULTS_CACHE_KEY] as string | undefined;

      if (!json) {
        return null;
      }

      const parsed = JSON.parse(json);
      console.log('[SearchCache] Loaded cached search results:', parsed.length, 'items');
      return parsed;
    } catch (e) {
      console.error('[SearchCache] Failed to load search results cache', e);
      return null;
    }
  }

  /**
   * Save search results to cache
   */
  async function saveSearchResults(results: SearchResultItem[]): Promise<void> {
    try {
      const json = JSON.stringify(results);
      await browser.storage.local.set({ [RESULTS_CACHE_KEY]: json });
      console.log('[SearchCache] Saved search results:', results.length, 'items');
    } catch (e) {
      console.error('[SearchCache] Failed to save search results cache', e);
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
      console.log('[SearchCache] Loaded cached contributors:', parsed.length, 'users');
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
      console.log('[SearchCache] Saved contributors:', contributors.length, 'users');
    } catch (e) {
      console.error('[SearchCache] Failed to save contributors cache', e);
    }
  }

  /**
   * Clear search results cache (e.g., after a visit is recorded)
   */
  async function clearSearchResultsCache(): Promise<void> {
    try {
      await browser.storage.local.remove([RESULTS_CACHE_KEY, FIRST_RESULT_KEY]);
      console.log('[SearchCache] Cleared search results cache');
    } catch (e) {
      console.error('[SearchCache] Failed to clear search results cache', e);
    }
  }

  return {
    loadCache,
    saveCache,
    loadFirstResult,
    saveFirstResult,
    loadSearchResults,
    saveSearchResults,
    loadContributors,
    saveContributors,
    clearSearchResultsCache,
  };
}
