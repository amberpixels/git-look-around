<template>
  <div v-if="isVisible" class="gitjump-overlay" @click="handleBackdropClick">
    <div class="gitjump-popup" :class="{ 'dark-theme': isDarkTheme }">
      <!-- (1) Search input bar -->
      <div class="search-bar">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          placeholder="Search repositories..."
          class="search-input"
          @keydown.escape="hide"
        />
      </div>

      <!-- (2) Main content: repos list -->
      <div v-if="reposError" class="status error">{{ reposError }}</div>
      <div v-else-if="repos.length === 0" class="status empty-state">
        No repos in database yet. Sync will happen automatically.
      </div>

      <div v-else class="repos-container">
        <!-- Active repos (non-stale) -->
        <ul v-if="filteredActiveRepos.length > 0" class="repos-list">
          <li v-for="repo in filteredActiveRepos" :key="repo.id" class="repo-item">
            <div class="repo-header">
              <div class="repo-name-section">
                <svg
                  v-if="repo.fork"
                  class="repo-type-icon fork"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                >
                  <path
                    d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"
                  ></path>
                </svg>
                <svg v-else class="repo-type-icon owner" viewBox="0 0 16 16" width="14" height="14">
                  <path
                    d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"
                  ></path>
                </svg>
                <a :href="repo.html_url" target="_blank" class="repo-link">
                  {{ repo.full_name }}
                </a>
              </div>
              <div
                v-if="
                  repoCounts[repo.id] && (preferences.syncIssues || preferences.syncPullRequests)
                "
                class="repo-counts"
              >
                <span v-if="preferences.syncIssues" class="count-item issues">
                  <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
                    <path
                      d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
                    ></path>
                  </svg>
                  {{ repoCounts[repo.id].issues }}
                </span>
                <span v-if="preferences.syncPullRequests" class="count-item prs">
                  <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
                    <path
                      d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
                    ></path>
                  </svg>
                  {{ repoCounts[repo.id].prs }}
                </span>
              </div>
            </div>
            <div v-if="repo.description" class="repo-desc">{{ repo.description }}</div>
          </li>
        </ul>

        <!-- Stale repos separator and list -->
        <div v-if="filteredStaleRepos.length > 0" class="stale-section">
          <div class="stale-separator">Stale repositories (not updated in last 6 months)</div>
          <ul class="repos-list stale-repos">
            <li v-for="repo in filteredStaleRepos" :key="repo.id" class="repo-item">
              <div class="repo-header">
                <div class="repo-name-section">
                  <svg
                    v-if="repo.fork"
                    class="repo-type-icon fork"
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                  >
                    <path
                      d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"
                    ></path>
                  </svg>
                  <svg
                    v-else
                    class="repo-type-icon owner"
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                  >
                    <path
                      d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"
                    ></path>
                  </svg>
                  <a :href="repo.html_url" target="_blank" class="repo-link">
                    {{ repo.full_name }}
                  </a>
                </div>
              </div>
              <div v-if="repo.description" class="repo-desc">{{ repo.description }}</div>
            </li>
          </ul>
        </div>

        <!-- No results message -->
        <div
          v-if="searchQuery && filteredActiveRepos.length === 0 && filteredStaleRepos.length === 0"
          class="status empty-state"
        >
          No repositories match "{{ searchQuery }}"
        </div>
      </div>

      <!-- (3) Status bar at bottom -->
      <div class="status-bar">
        <div class="status-indicator">
          <span class="status-dot" :class="syncStateClass" :title="syncStateTooltip"></span>
          <span class="status-text">{{ syncStateText }}</span>
        </div>

        <!-- Rate limit warning (only shown when close to limit) -->
        <div v-if="showRateLimitWarning" class="rate-limit-warning" :title="rateLimitTooltip">
          ⚠️
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onUnmounted } from 'vue';
import { useRepos } from '@/src/composables/useRepos';
import { useSyncStatus } from '@/src/composables/useSyncStatus';
import { useRateLimit } from '@/src/composables/useRateLimit';
import { useSyncPreferences } from '@/src/composables/useSyncPreferences';
import type { RepoRecord } from '@/src/types';

const isVisible = ref(false);
const searchQuery = ref('');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchInputRef = ref<any>(null);
const isDarkTheme = ref(false);

// Use composables
const {
  repos,
  activeRepos,
  staleRepos,
  repoCounts,
  error: reposError,
  loadAll: loadReposData,
} = useRepos();

const { status: syncStatus } = useSyncStatus(500); // Poll every 500ms for real-time updates
const { rateLimit } = useRateLimit(0);
const { preferences } = useSyncPreferences();

/**
 * Filter repos by search query (simple substring match)
 */
function filterRepos(reposList: RepoRecord[]): RepoRecord[] {
  if (!searchQuery.value.trim()) {
    return reposList;
  }

  const query = searchQuery.value.toLowerCase();
  return reposList.filter(
    (repo) =>
      repo.full_name.toLowerCase().includes(query) ||
      (repo.description?.toLowerCase().includes(query) ?? false),
  );
}

// Filtered repo lists
const filteredActiveRepos = computed(() => filterRepos(activeRepos.value));
const filteredStaleRepos = computed(() => filterRepos(staleRepos.value));

/**
 * Sync state class for status dot (green/yellow/red)
 */
const syncStateClass = computed(() => {
  if (!syncStatus.value) return 'loading';

  const status = syncStatus.value;

  if (status.lastError) {
    return 'error'; // Red
  } else if (status.isRunning) {
    return 'syncing'; // Yellow
  } else if (status.lastCompletedAt) {
    return 'synced'; // Green
  } else {
    return 'not-synced'; // Red
  }
});

/**
 * Sync state text (short summary)
 */
const syncStateText = computed(() => {
  if (!syncStatus.value) return 'Loading...';

  const status = syncStatus.value;
  const account = status.accountLogin ? `@${status.accountLogin}` : 'Account';

  if (status.isRunning) {
    const { activeRepos, issuesProgress, prsProgress } = status.progress;
    const progress = Math.max(issuesProgress, prsProgress);

    if (activeRepos === 0) {
      return `${account}: Syncing...`;
    } else {
      return `${account}: Syncing ${progress}/${activeRepos}`;
    }
  } else if (status.lastCompletedAt) {
    const timeAgo = Math.round((Date.now() - status.lastCompletedAt) / 1000 / 60);
    const timeText = timeAgo === 0 ? 'just now' : `${timeAgo}m ago`;
    return `${account} - synced ${timeText}`;
  } else if (status.lastError) {
    return `${account} - sync failed`;
  } else {
    return `${account} - not synced`;
  }
});

/**
 * Sync state tooltip (detailed info)
 */
const syncStateTooltip = computed(() => {
  if (!syncStatus.value) return 'Loading sync status...';

  const status = syncStatus.value;

  if (status.lastError) {
    return `Error: ${status.lastError}`;
  } else if (status.isRunning) {
    const { activeRepos, issuesProgress, prsProgress } = status.progress;
    return `Syncing: ${issuesProgress}/${activeRepos} issues, ${prsProgress}/${activeRepos} PRs`;
  } else if (status.lastCompletedAt) {
    const { activeRepos } = status.progress;
    const date = new Date(status.lastCompletedAt).toLocaleString();
    return `Last synced: ${date} (${activeRepos} active repos)`;
  } else {
    return 'Not synced yet';
  }
});

/**
 * Show rate limit warning only when close to 10% remaining
 */
const showRateLimitWarning = computed(() => {
  if (!rateLimit.value) return false;

  const remaining = rateLimit.value.remaining;
  const limit = rateLimit.value.limit;
  const percentRemaining = (remaining / limit) * 100;

  return percentRemaining < 10;
});

/**
 * Rate limit tooltip
 */
const rateLimitTooltip = computed(() => {
  if (!rateLimit.value) return '';

  const { remaining, limit, reset } = rateLimit.value;
  const resetDate = new Date(reset * 1000);
  const resetTime = resetDate.toLocaleTimeString();

  return `${remaining}/${limit} requests remaining, resets at ${resetTime}`;
});

async function show() {
  isVisible.value = true;
  searchQuery.value = ''; // Reset search on open
  // Load data immediately
  await loadReposData();
  // Focus input field
  await nextTick();
  searchInputRef.value?.focus();
}

function hide() {
  isVisible.value = false;
}

async function toggle() {
  if (isVisible.value) {
    hide();
  } else {
    await show();
  }
}

/**
 * Detect dark theme preference
 * Checks both OS-level and GitHub's theme
 */
function detectDarkTheme(): boolean {
  // Method 1: Check GitHub's theme (most accurate for GitHub pages)
  const htmlElement = document.documentElement;
  const githubTheme = htmlElement.getAttribute('data-color-mode');
  const githubDarkTheme = htmlElement.getAttribute('data-dark-theme');

  if (githubTheme === 'dark' || githubDarkTheme) {
    return true;
  }

  // Method 2: Check OS-level preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }

  // Method 3: Fallback - check if GitHub has dark class
  if (document.body.classList.contains('dark') || document.body.classList.contains('dark-theme')) {
    return true;
  }

  return false;
}

/**
 * Update dark theme state
 */
function updateTheme() {
  isDarkTheme.value = detectDarkTheme();
  console.warn('[CommandPalette] Theme detected:', isDarkTheme.value ? 'dark' : 'light');
}

// Auto-load data when component mounts (content script loads)
onMounted(async () => {
  // Silently load data in background so it's ready when user opens overlay
  await loadReposData();

  // Detect initial theme
  updateTheme();

  // Listen for OS-level theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = () => updateTheme();
  mediaQuery.addEventListener('change', handleThemeChange);

  // Listen for GitHub theme changes (using MutationObserver)
  const observer = new window.MutationObserver(() => updateTheme());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-color-mode', 'data-dark-theme', 'class'],
  });

  // Cleanup
  onUnmounted(() => {
    mediaQuery.removeEventListener('change', handleThemeChange);
    observer.disconnect();
  });
});

function handleBackdropClick(e: MouseEvent) {
  // Only close if clicking the backdrop, not the popup itself
  if (e.target === e.currentTarget) {
    hide();
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isVisible.value) {
    hide();
  }
}

// Listen for Escape key globally
document.addEventListener('keydown', handleKeydown);

// Expose methods so parent can call them
defineExpose({
  show,
  hide,
  toggle,
});
</script>

<style scoped>
.gitjump-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
}

.gitjump-popup {
  background: white;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* (1) Search bar */
.search-bar {
  padding: 16px 20px;
  border-bottom: 1px solid #e1e4e8;
  background: #fafbfc;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 16px;
  border: 1px solid #d1d5da;
  border-radius: 6px;
  outline: none;
  font-family: inherit;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.search-input:focus {
  border-color: #0366d6;
  box-shadow: 0 0 0 3px rgba(3, 102, 214, 0.1);
}

.search-input::placeholder {
  color: #6a737d;
}

/* (2) Main content area */
.status {
  padding: 40px 20px;
  text-align: center;
  color: #586069;
  font-size: 14px;
}

.status.error {
  color: #d73a49;
}

.status.empty-state {
  color: #6a737d;
}

.repos-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  flex: 1;
}

.repos-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.stale-section {
  margin-top: 20px;
}

.stale-separator {
  padding: 12px 16px;
  background: #f6f8fa;
  border-top: 2px solid #e1e4e8;
  border-bottom: 1px solid #e1e4e8;
  font-size: 13px;
  font-weight: 600;
  color: #586069;
  text-align: center;
}

.stale-repos .repo-item {
  opacity: 0.7;
}

.stale-repos .repo-link {
  color: #6a737d;
}

.stale-repos .repo-item:hover {
  opacity: 1;
}

.repo-item {
  padding: 8px 12px;
  border-bottom: 1px solid #e1e4e8;
}

.repo-item:last-child {
  border-bottom: none;
}

.repo-item:hover {
  background: #f6f8fa;
}

.repo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 2px;
}

.repo-name-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.repo-type-icon {
  flex-shrink: 0;
  fill: currentColor;
}

.repo-type-icon.fork {
  color: #656d76;
}

.repo-type-icon.owner {
  color: #0969da;
}

.repo-link {
  font-weight: 600;
  color: #0366d6;
  text-decoration: none;
  font-size: 14px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.repo-link:hover {
  text-decoration: underline;
}

.repo-desc {
  font-size: 12px;
  color: #586069;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 0;
}

.repo-counts {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;
}

.count-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #586069;
  font-weight: 500;
}

.count-item .icon {
  fill: currentColor;
  flex-shrink: 0;
}

.count-item.issues {
  color: #0969da;
}

.count-item.prs {
  color: #1a7f37;
}

/* (3) Status bar at bottom */
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  border-top: 1px solid #e1e4e8;
  background: #fafbfc;
  font-size: 12px;
  flex-shrink: 0;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.synced {
  background: #28a745;
  box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2);
}

.status-dot.syncing {
  background: #dbab09;
  box-shadow: 0 0 0 2px rgba(219, 171, 9, 0.2);
  animation: pulse-syncing 2s ease-in-out infinite;
}

.status-dot.error,
.status-dot.not-synced {
  background: #d73a49;
  box-shadow: 0 0 0 2px rgba(215, 58, 73, 0.2);
}

.status-dot.loading {
  background: #959da5;
  box-shadow: 0 0 0 2px rgba(149, 157, 165, 0.2);
}

@keyframes pulse-syncing {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.status-text {
  color: #586069;
  font-weight: 500;
}

.rate-limit-warning {
  font-size: 16px;
  cursor: help;
  animation: pulse-warning 2s ease-in-out infinite;
}

@keyframes pulse-warning {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

/* Dark theme overrides */
.gitjump-popup.dark-theme {
  background: #0d1117;
  color: #e6edf3;
}

.dark-theme .search-bar {
  background: #161b22;
  border-bottom-color: #30363d;
}

.dark-theme .search-input {
  background: #0d1117;
  border-color: #30363d;
  color: #e6edf3;
}

.dark-theme .search-input::placeholder {
  color: #7d8590;
}

.dark-theme .search-input:focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

.dark-theme .status {
  color: #7d8590;
}

.dark-theme .status.error {
  color: #f85149;
}

.dark-theme .status.empty-state {
  color: #7d8590;
}

.dark-theme .stale-separator {
  background: #161b22;
  border-top-color: #30363d;
  border-bottom-color: #30363d;
  color: #7d8590;
}

.dark-theme .repo-item {
  border-bottom-color: #21262d;
}

.dark-theme .repo-item:hover {
  background: #161b22;
}

.dark-theme .repo-link {
  color: #58a6ff;
}

.dark-theme .stale-repos .repo-link {
  color: #7d8590;
}

.dark-theme .repo-desc {
  color: #7d8590;
}

.dark-theme .count-item {
  color: #7d8590;
}

.dark-theme .count-item.issues {
  color: #58a6ff;
}

.dark-theme .count-item.prs {
  color: #3fb950;
}

.dark-theme .status-bar {
  background: #161b22;
  border-top-color: #30363d;
}

.dark-theme .status-text {
  color: #7d8590;
}

.dark-theme .repo-type-icon.fork {
  color: #7d8590;
}

.dark-theme .repo-type-icon.owner {
  color: #58a6ff;
}
</style>
