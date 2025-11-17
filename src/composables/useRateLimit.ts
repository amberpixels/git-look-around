/**
 * Composable for accessing GitHub API rate limit info
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { useBackgroundMessage } from './useBackgroundMessage';
import { MessageType } from '@/src/messages/types';
import type { RateLimitInfo } from '@/src/api/github';

export function useRateLimit(pollInterval = 5000) {
  const { sendMessage } = useBackgroundMessage();

  const rateLimit = ref<RateLimitInfo | null>(null);
  const loading = ref(true);

  let intervalId: number | null = null;

  async function fetchRateLimit() {
    try {
      rateLimit.value = await sendMessage<RateLimitInfo | null>(MessageType.GET_RATE_LIMIT);
    } catch (err) {
      console.error('[useRateLimit] Error:', err);
    } finally {
      loading.value = false;
    }
  }

  function getRateLimitStatus(): 'good' | 'warning' | 'critical' {
    if (!rateLimit.value) return 'good';
    const remaining = rateLimit.value.remaining;
    if (remaining < 100) return 'critical';
    if (remaining < 500) return 'warning';
    return 'good';
  }

  onMounted(async () => {
    await fetchRateLimit();

    // Poll for updates if interval specified
    if (pollInterval > 0) {
      intervalId = window.setInterval(fetchRateLimit, pollInterval);
    }
  });

  onUnmounted(() => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
  });

  return {
    rateLimit,
    loading,
    getRateLimitStatus,
    fetchRateLimit,
  };
}
