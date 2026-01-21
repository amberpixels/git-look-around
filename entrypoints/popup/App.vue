<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { isAuthenticated as checkAuth, getDebugMode } from '@/src/storage/chrome';
import { useImportStatus } from '@/src/composables/useImportStatus';
import { useRateLimit } from '@/src/composables/useRateLimit';
import { MessageType } from '@/src/messages/types';
import GitHubIcon from '@/src/components/GitHubIcon.vue';

const isAuthenticated = ref<boolean | null>(null);
const loading = ref(true);
const isDarkTheme = ref(false);
const isDebugMode = ref(false);
const shortcutKey = ref<string>('');
const currentRepoName = ref<string | null>(null);
const isCurrentRepoIndexed = ref(false);
const paletteError = ref<string | null>(null);

// Use composables for data fetching
const { status: syncStatus } = useImportStatus(5000); // Poll every 5 seconds
const { rateLimit, getRateLimitStatus } = useRateLimit(5000);

// Track last known indexed repos count (to show during sync when progress is 0)
const lastKnownIndexedRepos = ref(0);
watch(
  () => syncStatus.value?.progress.indexedRepos,
  (newValue) => {
    if (newValue && newValue > 0) {
      lastKnownIndexedRepos.value = newValue;
    }
  },
  { immediate: true },
);

// Computed sync status text (not currently used, reserved for future)
const _syncStatusText = computed(() => {
  if (!syncStatus.value) return 'Loading...';

  const status = syncStatus.value;

  if (status.isRunning) {
    const { indexedRepos, issuesProgress, prsProgress } = status.progress;
    const account = status.accountLogin ? `@${status.accountLogin}: ` : '';
    if (indexedRepos > 0) {
      return `${account}Syncing ${Math.max(issuesProgress, prsProgress)}/${indexedRepos}...`;
    } else {
      return `${account}Syncing...`;
    }
  } else if (status.lastCompletedAt) {
    const minutes = Math.round((Date.now() - status.lastCompletedAt) / 60000);
    const { indexedRepos } = status.progress;
    const account = status.accountLogin ? `@${status.accountLogin}` : 'Account';
    const repoCount = indexedRepos > 0 ? ` (${indexedRepos} repos)` : '';
    const timeAgo = minutes === 0 ? 'just now' : `${minutes}m ago`;
    return `${account}${repoCount} synced ${timeAgo}`;
  } else {
    return 'Not synced yet';
  }
});

// Format keyboard shortcut for display
const formattedShortcutKeys = computed(() => {
  if (!shortcutKey.value) return [];

  let formatted = shortcutKey.value;

  // Handle different shortcut formats
  // Replace symbols with readable names (and add separators)
  // Keep ⌘ symbol but add separators
  formatted = formatted
    .replace(/⌘/g, '+⌘+')
    .replace(/⇧/g, '+Shift+')
    .replace(/⌥/g, '+Option+')
    .replace(/⌃/g, '+Ctrl+')
    .replace(/MacCtrl/g, '+Ctrl+')
    .replace(/Command/g, '+⌘+'); // Also handle text "Command"

  // Split by '+' and filter out empty strings
  const keys = formatted.split('+').filter((key) => key.trim());

  return keys;
});

onMounted(async () => {
  try {
    isAuthenticated.value = await checkAuth();

    // Check debug mode
    isDebugMode.value = await getDebugMode();

    // Load keyboard shortcut
    await loadShortcut();

    // Detect current GitHub repo
    await detectCurrentRepo();
  } catch (err) {
    console.error('[Popup] Error during mount:', err);
    isAuthenticated.value = false;
  } finally {
    loading.value = false;
  }

  // Detect dark theme
  updateTheme();

  // Listen for theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = () => updateTheme();
  mediaQuery.addEventListener('change', handleThemeChange);

  onUnmounted(() => {
    mediaQuery.removeEventListener('change', handleThemeChange);
  });
});

async function loadShortcut() {
  try {
    const commands = await browser.commands.getAll();
    const toggleCommand = commands.find((cmd) => cmd.name === 'toggle-overlay');
    if (toggleCommand?.shortcut) {
      shortcutKey.value = toggleCommand.shortcut;
    }
  } catch (e) {
    console.error('Failed to load shortcut:', e);
  }
}

function updateTheme() {
  isDarkTheme.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function openOptions() {
  browser.runtime.openOptionsPage();
}

function reloadExtension() {
  browser.runtime.reload();
}

function openShortcutSettings() {
  browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
  window.close();
}

async function openCommandPalette() {
  paletteError.value = null;
  try {
    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      // Send message to the content script to toggle the overlay
      await browser.tabs.sendMessage(tabs[0].id, {
        type: MessageType.TOGGLE_OVERLAY,
      });
      // Close the popup
      window.close();
    }
  } catch (error) {
    console.error('Failed to open command palette:', error);
    // Check if it's a connection error (content script not ready)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('Could not establish connection') ||
      errorMessage.includes('Receiving end does not exist')
    ) {
      paletteError.value = 'Please refresh this page first';
    } else {
      paletteError.value = 'Failed to open palette';
    }
  }
}

async function detectCurrentRepo() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      const url = tabs[0].url;
      // Parse GitHub repo from URL: https://github.com/owner/repo/...
      const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        const owner = match[1];
        const repo = match[2];
        const repoName = `${owner}/${repo}`;
        currentRepoName.value = repoName;

        // Check if this repo is in our indexed repos
        const response = await browser.runtime.sendMessage({
          type: MessageType.GET_ALL_REPOS,
        });

        if (response?.success && response.data) {
          const repos = response.data;
          // Check if repo exists and is indexed
          const foundRepo = repos.find(
            (r: { full_name: string; indexed: boolean }) =>
              r.full_name.toLowerCase() === repoName.toLowerCase() && r.indexed,
          );
          isCurrentRepoIndexed.value = !!foundRepo;
        } else {
          isCurrentRepoIndexed.value = false;
        }
      } else {
        currentRepoName.value = null;
        isCurrentRepoIndexed.value = false;
      }
    }
  } catch (error) {
    console.error('Failed to detect current repo:', error);
    currentRepoName.value = null;
    isCurrentRepoIndexed.value = false;
  }
}

async function triggerSync(repoName?: string) {
  try {
    // If repoName is provided, syncs only that repo; otherwise syncs all repos
    await browser.runtime.sendMessage({
      type: MessageType.FORCE_IMPORT,
      payload: repoName ? { repoName } : undefined,
    });
  } catch (error) {
    console.error('Failed to trigger sync:', error);
  }
}

function getRateLimitResetTime(): string {
  if (!rateLimit.value) return '';
  const resetDate = new Date(rateLimit.value.reset * 1000);
  return resetDate.toLocaleTimeString();
}

function getTimeAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes === 0) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
</script>

<template>
  <div class="popup" :class="{ 'dark-theme': isDarkTheme }">
    <div class="header">
      <div class="header-content">
        <h1>GitHub Look-Around</h1>
        <button
          v-if="isDebugMode"
          class="reload-btn"
          title="Reload extension"
          @click="reloadExtension"
        >
          ↻
        </button>
      </div>
    </div>

    <div v-if="loading" class="status">Checking authentication...</div>

    <div v-else-if="isAuthenticated" class="authenticated">
      <!-- Command Palette -->
      <div class="info-section">
        <div class="info-label">Command Palette</div>
        <div class="command-palette-info">
          <div class="palette-btn-wrapper">
            <button class="command-palette-btn" @click="openCommandPalette">Open Palette</button>
            <div v-if="paletteError" class="palette-error">{{ paletteError }}</div>
          </div>
          <div v-if="formattedShortcutKeys.length > 0" class="shortcut-display">
            <span class="shortcut-text">Shortcut:</span>
            <div class="shortcut-keys">
              <kbd v-for="(key, index) in formattedShortcutKeys" :key="index">{{ key }}</kbd>
            </div>
          </div>
          <div v-else class="shortcut-not-set">
            <a href="#" @click.prevent="openShortcutSettings">Configure shortcut</a>
          </div>
        </div>
      </div>

      <!-- Sync Status -->
      <div class="info-section sync-section">
        <div class="info-label">Sync Status</div>
        <div v-if="syncStatus" class="sync-details">
          <div class="account-status">
            <GitHubIcon v-if="syncStatus.accountLogin" :size="14" />
            <span v-if="syncStatus.accountLogin">@{{ syncStatus.accountLogin }}</span>
            <span v-else>Account</span>
            <span class="check-mark">✓</span>
          </div>
          <div class="sync-stats">
            <template v-if="syncStatus.isRunning">
              {{ Math.max(syncStatus.progress.issuesProgress, syncStatus.progress.prsProgress) }}/{{
                syncStatus.progress.indexedRepos || lastKnownIndexedRepos
              }}
              repos indexed
              <span class="sync-time">(syncing...)</span>
            </template>
            <template v-else>
              {{ syncStatus.progress.indexedRepos || 0 }} repos indexed
              <span v-if="syncStatus.lastCompletedAt" class="sync-time">
                (synced {{ getTimeAgo(syncStatus.lastCompletedAt) }})
              </span>
              <span v-else class="sync-time"> (never synced) </span>
            </template>
          </div>
          <div class="sync-actions">
            <a
              href="#"
              class="sync-link"
              :class="{ disabled: syncStatus.isRunning }"
              @click.prevent="!syncStatus.isRunning && triggerSync()"
            >
              Force resync all
            </a>
            <a
              v-if="currentRepoName && isCurrentRepoIndexed"
              href="#"
              class="sync-link"
              :class="{ disabled: syncStatus.isRunning }"
              @click.prevent="!syncStatus.isRunning && triggerSync(currentRepoName)"
            >
              Force resync {{ currentRepoName }}
            </a>
          </div>
        </div>
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
    </div>

    <div v-else class="unauthenticated">
      <div class="status-badge error">⚠ Not Authenticated</div>
      <p class="message">You need to configure your GitHub token to use GitHub Look-Around.</p>
      <button class="button" @click="openOptions">Open Settings</button>
    </div>

    <div class="footer">
      <a href="https://github.com/amberpixels/git-look-around" target="_blank" class="link">
        GitHub
      </a>
      <a href="#" class="link settings-link" @click.prevent="openOptions">
        <span class="gear-icon">⚙</span>
        Settings
      </a>
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

.header-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #0366d6;
}

.reload-btn {
  padding: 4px 8px;
  font-size: 18px;
  background: transparent;
  border: 1px solid #d1d5da;
  border-radius: 4px;
  cursor: pointer;
  color: #586069;
  transition: all 0.2s;
  line-height: 1;
}

.reload-btn:hover {
  background: #f6f8fa;
  border-color: #586069;
  color: #24292e;
}

.reload-btn:active {
  background: #e1e4e8;
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

.command-palette-info {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.shortcut-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.shortcut-text {
  color: #586069;
}

.shortcut-keys {
  display: flex;
  gap: 4px;
}

.shortcut-keys kbd {
  display: inline-block;
  padding: 3px 6px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 11px;
  color: #444d56;
  background-color: #fafbfc;
  border: 1px solid #d1d5da;
  border-radius: 3px;
  box-shadow: inset 0 -1px 0 #d1d5da;
}

.shortcut-not-set {
  color: #586069;
  font-size: 12px;
}

.shortcut-not-set a {
  color: #0366d6;
  text-decoration: none;
  font-weight: 500;
}

.shortcut-not-set a:hover {
  text-decoration: underline;
}

.command-palette-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #ffffff;
  background: #0366d6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.command-palette-btn:hover {
  background: #0256c7;
}

.command-palette-btn:active {
  background: #024aa8;
}

.palette-btn-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.palette-error {
  font-size: 11px;
  color: #d73a49;
  font-weight: 500;
}

.btn-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.footer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e1e4e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.link {
  font-size: 13px;
  color: #0366d6;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.settings-link {
  display: flex;
  align-items: center;
  gap: 4px;
}

.gear-icon {
  font-size: 14px;
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

.sync-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.account-status {
  font-size: 14px;
  font-weight: 600;
  color: #24292e;
  display: flex;
  align-items: center;
  gap: 6px;
}

.check-mark {
  color: #2ea44f;
  font-size: 16px;
}

.sync-stats {
  font-size: 12px;
  color: #586069;
}

.sync-time {
  color: #6a737d;
  font-style: italic;
}

.sync-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
}

.sync-link {
  color: #0366d6;
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s;
}

.sync-link:hover:not(.disabled) {
  text-decoration: underline;
}

.sync-link.disabled {
  color: #94a3b8;
  cursor: not-allowed;
  opacity: 0.6;
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

/* Dark theme overrides */
.popup.dark-theme {
  background: #1c2128;
  color: #adbac7;
}

.dark-theme .header h1 {
  color: #539bf5;
}

.dark-theme .reload-btn {
  border-color: #444c56;
  color: #768390;
}

.dark-theme .reload-btn:hover {
  background: #22272e;
  border-color: #768390;
  color: #adbac7;
}

.dark-theme .reload-btn:active {
  background: #2d333b;
}

.dark-theme .status {
  color: #768390;
}

.dark-theme .status-badge.success {
  background: #1a372a;
  color: #56d364;
}

.dark-theme .status-badge.error {
  background: #3c1618;
  color: #f85149;
}

.dark-theme .instructions p {
  color: #adbac7;
}

.dark-theme .instructions kbd {
  color: #adbac7;
  background-color: #22272e;
  border: 1px solid #444c56;
  box-shadow: inset 0 -1px 0 #373e47;
}

.dark-theme .hint {
  color: #768390;
}

.dark-theme .message {
  color: #768390;
}

.dark-theme .button {
  background-color: #1f6feb;
}

.dark-theme .button:hover {
  background-color: #388bfd;
}

.dark-theme .button:active {
  background-color: #1f6feb;
}

.dark-theme .shortcut-text {
  color: #768390;
}

.dark-theme .shortcut-keys kbd {
  color: #adbac7;
  background-color: #2d333b;
  border: 1px solid #444c56;
  box-shadow: inset 0 -1px 0 #373e47;
}

.dark-theme .shortcut-not-set {
  color: #768390;
}

.dark-theme .shortcut-not-set a {
  color: #539bf5;
}

.dark-theme .command-palette-btn {
  background: #1f6feb;
}

.dark-theme .command-palette-btn:hover {
  background: #388bfd;
}

.dark-theme .command-palette-btn:active {
  background: #58a6ff;
}

.dark-theme .palette-error {
  color: #f85149;
}

.dark-theme .footer {
  border-top: 1px solid #373e47;
}

.dark-theme .link {
  color: #539bf5;
}

.dark-theme .info-label {
  color: #768390;
}

.dark-theme .info-value {
  color: #adbac7;
}

.dark-theme .account-status {
  color: #adbac7;
}

.dark-theme .check-mark {
  color: #56d364;
}

.dark-theme .sync-stats {
  color: #768390;
}

.dark-theme .sync-time {
  color: #636e7b;
}

.dark-theme .rate-limit-bar {
  background: #373e47;
}

.dark-theme .status-good {
  color: #56d364;
}

.dark-theme .status-warning {
  color: #d29922;
}

.dark-theme .status-critical {
  color: #f85149;
}

.dark-theme .reset-time {
  color: #768390;
}

.dark-theme .rate-limit-stats {
  color: #768390;
}

.dark-theme .sync-link {
  color: #539bf5;
}

.dark-theme .sync-link.disabled {
  color: #6e7681;
  opacity: 0.6;
}
</style>
