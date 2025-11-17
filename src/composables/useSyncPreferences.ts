/**
 * Composable for managing sync preferences
 */

import { ref, onMounted } from 'vue';
import { getSyncPreferences, type SyncPreferences } from '@/src/storage/chrome';

export function useSyncPreferences() {
  const preferences = ref<SyncPreferences>({
    syncIssues: true,
    syncPullRequests: true,
  });
  const loading = ref(true);

  async function loadPreferences() {
    loading.value = true;
    try {
      preferences.value = await getSyncPreferences();
    } catch (error) {
      console.error('[useSyncPreferences] Failed to load preferences:', error);
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
