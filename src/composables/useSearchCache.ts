import { ref } from 'vue';
import type { SearchableEntity } from './useUnifiedSearch';

const CACHE_KEY = 'gitjump_search_entities';

export function useSearchCache() {
  const cachedString = ref<string | null>(null);

  /**
   * Load entities from session storage
   */
  function loadCache(): SearchableEntity[] | null {
    try {
      const json = sessionStorage.getItem(CACHE_KEY);
      if (!json) return null;

      cachedString.value = json;
      return JSON.parse(json);
    } catch (e) {
      console.error('[Gitjump] Failed to load search cache', e);
      return null;
    }
  }

  /**
   * Save entities to session storage
   * Returns true if data was different from cache (and thus UI should update)
   * even if saving to storage failed
   */
  function saveCache(entities: SearchableEntity[]): boolean {
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
      sessionStorage.setItem(CACHE_KEY, json);
    } catch (e) {
      console.error('[Gitjump] Failed to save search cache (likely quota exceeded)', e);
      // Return true because data CHANGED, even if we couldn't persist it
      return true;
    }

    return true;
  }

  return {
    loadCache,
    saveCache,
  };
}
