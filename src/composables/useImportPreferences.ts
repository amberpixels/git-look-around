/**
 * Composable for managing import preferences
 */

import { ref, onMounted } from 'vue';
import { getImportPreferences, type ImportPreferences } from '@/src/storage/chrome';

export function useImportPreferences() {
  const preferences = ref<ImportPreferences>({
    importIssues: true,
    importPullRequests: true,
    debugMode: false,
  });
  const loading = ref(true);

  async function loadPreferences() {
    loading.value = true;
    try {
      preferences.value = await getImportPreferences();
    } catch (error) {
      console.error('[useImportPreferences] Failed to load preferences:', error);
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    loadPreferences();
  });

  return {
    preferences,
    loading,
    loadPreferences,
  };
}
