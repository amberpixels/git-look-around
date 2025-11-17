<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { isAuthenticated as checkAuth } from '@/shared/storage';
import { MessageType } from '@/shared/messages';
import type { ExtensionMessage } from '@/shared/messages';
import type { RateLimitInfo } from '@/shared/github-api';
import type { SyncStatus } from '@/shared/sync-engine';

const isAuthenticated = ref<boolean | null>(null);
const loading = ref(true);
const rateLimit = ref<RateLimitInfo | null>(null);
const syncStatusText = ref<string>('');

// Helper to send messages to background
async function sendMessage<T>(type: MessageType, payload?: unknown): Promise<T> {
  const message: ExtensionMessage = { type, payload };
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage(message, (response) => {
      if (response?.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}

onMounted(async () => {
  try {
    isAuthenticated.value = await checkAuth();

    // Load initial rate limit and sync status from background
    rateLimit.value = await sendMessage<RateLimitInfo | null>(MessageType.GET_RATE_LIMIT);
    console.warn('[Popup] Rate limit from background:', rateLimit.value);

    const status = await sendMessage<SyncStatus>(MessageType.GET_SYNC_STATUS);
    console.warn('[Popup] Sync status from background:', status);
    updateSyncStatusText(status);

    // Poll for updates every 5 seconds while popup is open
    const interval = window.setInterval(async () => {
      try {
        const updatedStatus = await sendMessage<SyncStatus>(MessageType.GET_SYNC_STATUS);
        console.warn('[Popup] Sync status updated:', updatedStatus);
        updateSyncStatusText(updatedStatus);
        rateLimit.value = await sendMessage<RateLimitInfo | null>(MessageType.GET_RATE_LIMIT);
      } catch (err) {
        console.error('[Popup] Error polling status:', err);
      }
    }, 5000);

    // Cleanup on unmount
    onUnmounted(() => window.clearInterval(interval));
  } catch (err) {
    console.error('[Popup] Error during mount:', err);
    isAuthenticated.value = false;
  } finally {
    loading.value = false;
  }
});

function updateSyncStatusText(status: SyncStatus) {
  if (status.isRunning) {
    const { activeRepos, issuesProgress, prsProgress } = status.progress;
    const account = status.accountLogin ? `@${status.accountLogin}: ` : '';
    if (activeRepos > 0) {
      syncStatusText.value = `${account}Syncing ${Math.max(issuesProgress, prsProgress)}/${activeRepos}...`;
    } else {
      syncStatusText.value = `${account}Syncing...`;
    }
  } else if (status.lastCompletedAt) {
    const minutes = Math.round((Date.now() - status.lastCompletedAt) / 60000);
    const { activeRepos } = status.progress;
    const account = status.accountLogin ? `@${status.accountLogin}` : 'Account';
    const repoCount = activeRepos > 0 ? ` (${activeRepos} repos)` : '';
    const timeAgo = minutes === 0 ? 'just now' : `${minutes}m ago`;
    syncStatusText.value = `${account}${repoCount} synced ${timeAgo}`;
  } else {
    syncStatusText.value = 'Not synced yet';
  }
}

function openOptions() {
  browser.runtime.openOptionsPage();
}

function getRateLimitStatus(): 'good' | 'warning' | 'critical' {
  if (!rateLimit.value) return 'good';
  const remaining = rateLimit.value.remaining;
  if (remaining < 100) return 'critical';
  if (remaining < 500) return 'warning';
  return 'good';
}

function getRateLimitResetTime(): string {
  if (!rateLimit.value) return '';
  const resetDate = new Date(rateLimit.value.reset * 1000);
  return resetDate.toLocaleTimeString();
}
</script>

<template>
  <div class="popup">
    <div class="header">
      <h1>Gitjump</h1>
      <p class="subtitle">GitHub Fuzzy Finder</p>
    </div>

    <div v-if="loading" class="status">Checking authentication...</div>

    <div v-else-if="isAuthenticated" class="authenticated">
      <div class="status-badge success">✓ Authenticated</div>

      <!-- Sync Status -->
      <div class="info-section">
        <div class="info-label">Sync Status</div>
        <div class="info-value">{{ syncStatusText }}</div>
      </div>

      <!-- Rate Limit -->
      <div v-if="rateLimit" class="info-section">
        <div class="info-label">API Rate Limit</div>
        <div class="rate-limit-bar">
          <div
            class="rate-limit-fill"
            :class="getRateLimitStatus()"
            :style="{ width: `${(rateLimit.remaining / rateLimit.limit) * 100}%` }"
          ></div>
        </div>
        <div class="rate-limit-text">
          <span :class="`status-${getRateLimitStatus()}`">
            {{ rateLimit.remaining }} / {{ rateLimit.limit }}
          </span>
          <span class="reset-time">Resets at {{ getRateLimitResetTime() }}</span>
        </div>
        <div class="rate-limit-stats">
          <span>Used: {{ rateLimit.used }}</span>
        </div>
      </div>

      <div class="instructions">
        <p>Press <kbd>⌘</kbd> <kbd>Shift</kbd> <kbd>K</kbd> on any GitHub page</p>
        <p class="hint">to open the command palette</p>
      </div>
    </div>

    <div v-else class="unauthenticated">
      <div class="status-badge error">⚠ Not Authenticated</div>
      <p class="message">You need to configure your GitHub token to use Gitjump.</p>
      <button class="button" @click="openOptions">Open Settings</button>
    </div>

    <div class="footer">
      <a href="https://github.com/amberpixels/gitjump" target="_blank" class="link"> GitHub </a>
    </div>
  </div>
</template>

<style scoped>
.popup {
  width: 320px;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #ffffff;
  color: #24292e;
}

.header {
  text-align: center;
  margin-bottom: 20px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #0366d6;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #586069;
}

.status {
  text-align: center;
  padding: 20px;
  color: #586069;
}

.authenticated,
.unauthenticated {
  text-align: center;
}

.status-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
}

.status-badge.success {
  background: #dcffe4;
  color: #22863a;
}

.status-badge.error {
  background: #ffe3e6;
  color: #d73a49;
}

.instructions {
  margin-top: 16px;
}

.instructions p {
  margin: 8px 0;
  font-size: 14px;
  color: #24292e;
}

.instructions kbd {
  display: inline-block;
  padding: 3px 6px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: #444d56;
  background-color: #fafbfc;
  border: 1px solid #d1d5da;
  border-radius: 3px;
  box-shadow: inset 0 -1px 0 #d1d5da;
}

.hint {
  font-size: 12px;
  color: #586069;
}

.message {
  margin: 16px 0;
  font-size: 14px;
  color: #586069;
}

.button {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  background-color: #0366d6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.button:hover {
  background-color: #0256c7;
}

.button:active {
  background-color: #024aa8;
}

.footer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e1e4e8;
  text-align: center;
}

.link {
  font-size: 13px;
  color: #0366d6;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.info-section {
  margin: 16px 0;
  text-align: left;
}

.info-label {
  font-size: 11px;
  font-weight: 600;
  color: #6a737d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.info-value {
  font-size: 13px;
  color: #24292e;
}

.rate-limit-bar {
  height: 8px;
  background: #e1e4e8;
  border-radius: 4px;
  overflow: hidden;
  margin: 8px 0;
}

.rate-limit-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.rate-limit-fill.good {
  background: linear-gradient(90deg, #28a745, #34d058);
}

.rate-limit-fill.warning {
  background: linear-gradient(90deg, #dbab09, #f9c513);
}

.rate-limit-fill.critical {
  background: linear-gradient(90deg, #d73a49, #f97583);
}

.rate-limit-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-top: 4px;
}

.status-good {
  color: #22863a;
  font-weight: 600;
}

.status-warning {
  color: #b08800;
  font-weight: 600;
}

.status-critical {
  color: #d73a49;
  font-weight: 600;
}

.reset-time {
  font-size: 11px;
  color: #6a737d;
}

.rate-limit-stats {
  font-size: 11px;
  color: #6a737d;
  margin-top: 4px;
}
</style>
