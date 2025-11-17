/**
 * Composable for accessing sync status from background worker
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { useBackgroundMessage } from './useBackgroundMessage';
import { MessageType } from '@/src/messages/types';
import type { SyncStatus } from '@/src/sync/engine';

export function useSyncStatus(pollInterval = 5000) {
  const { sendMessage } = useBackgroundMessage();

  const status = ref<SyncStatus | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  let intervalId: number | null = null;

  async function fetchStatus() {
    try {
      status.value = await sendMessage<SyncStatus>(MessageType.GET_SYNC_STATUS);
      error.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch sync status';
      console.error('[useSyncStatus] Error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function forceSync() {
    try {
      await sendMessage(MessageType.FORCE_SYNC);
      await fetchStatus(); // Refresh status after forcing sync
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to force sync';
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
