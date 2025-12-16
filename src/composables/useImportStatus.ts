/**
 * Composable for accessing import status from background worker
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { useBackgroundMessage } from './useBackgroundMessage';
import { MessageType } from '@/src/messages/types';
import type { ImportStatus } from '@/src/import/engine';

export function useImportStatus(pollInterval = 5000) {
  const { sendMessage } = useBackgroundMessage();

  const status = ref<ImportStatus | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  let intervalId: number | null = null;

  async function fetchStatus() {
    try {
      status.value = await sendMessage<ImportStatus>(MessageType.GET_IMPORT_STATUS);
      error.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch import status';
      console.error('[useImportStatus] Error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function forceSync() {
    try {
      await sendMessage(MessageType.FORCE_IMPORT);
      await fetchStatus(); // Refresh status after forcing import
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to force import';
      throw err;
    }
  }

  onMounted(async () => {
    await fetchStatus();

    // Poll for updates if interval specified
    if (pollInterval > 0) {
      intervalId = window.setInterval(fetchStatus, pollInterval);
    }
  });

  onUnmounted(() => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
  });

  return {
    status,
    loading,
    error,
    fetchStatus,
    forceSync,
  };
}
