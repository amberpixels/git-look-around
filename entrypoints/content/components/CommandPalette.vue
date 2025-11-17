<template>
  <div v-if="isVisible" class="gitjump-overlay" @click="handleBackdropClick">
    <div class="gitjump-popup">
      <div class="popup-header">
        <h2>Your Repositories</h2>
        <div class="header-right">
          <div class="sync-status">
            <span :class="{ syncing: isSyncing }">{{ syncStatus }}</span>
            <button v-if="!isSyncing" class="sync-button" @click="triggerSync">↻ Sync</button>
          </div>
          <div v-if="rateLimit" class="rate-limit-compact">
            <span
              class="rate-limit-dot"
              :class="getRateLimitStatus()"
              :title="`API: ${rateLimit.remaining}/${rateLimit.limit}`"
            ></span>
            <span class="rate-limit-label">Connected</span>
          </div>
        </div>
      </div>

      <div v-if="error" class="status error">{{ error }}</div>
      <div v-else-if="repos.length === 0" class="status">
        No repos in database yet. Click "Sync" to sync from GitHub.
      </div>

      <div v-else class="repos-container">
        <!-- Active repos (non-stale) -->
        <ul v-if="activeRepos.length > 0" class="repos-list">
          <li v-for="repo in activeRepos" :key="repo.id" class="repo-item">
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
              <div v-if="repoCounts[repo.id]" class="repo-counts">
                <span class="count-item issues">
                  <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
                    <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
                    <path
                      d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
                    ></path>
                  </svg>
                  {{ repoCounts[repo.id].issues }}
                </span>
                <span class="count-item prs">
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
        <div v-if="staleRepos.length > 0" class="stale-section">
          <div class="stale-separator">Stale repositories (not updated in last 6 months)</div>
          <ul class="repos-list stale-repos">
            <li v-for="repo in staleRepos" :key="repo.id" class="repo-item">
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { MessageType } from '@/shared/messages';
import type { ExtensionMessage } from '@/shared/messages';
import type { RepoRecord } from '@/shared/types';
import type { RateLimitInfo } from '@/shared/github-api';
import type { SyncStatus } from '@/shared/sync-engine';

const isVisible = ref(false);
const repos = ref<RepoRecord[]>([]);
const error = ref('');

// Track counts for each repo
const repoCounts = ref<Record<number, { issues: number; prs: number }>>({});

// Sync status
const syncStatus = ref<string>('');
const isSyncing = ref(false);

// Rate limit
const rateLimit = ref<RateLimitInfo | null>(null);

// Stale repo threshold (same as sync-engine)
const STALE_REPO_THRESHOLD_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

// Split repos into active and stale
const activeRepos = ref<RepoRecord[]>([]);
const staleRepos = ref<RepoRecord[]>([]);

/**
 * Check if repo is stale (not updated in last 6 months)
 */
function isRepoStale(repo: RepoRecord): boolean {
  if (!repo.updated_at) return false;
  const lastUpdate = new Date(repo.updated_at).getTime();
  const now = Date.now();
  return now - lastUpdate > STALE_REPO_THRESHOLD_MS;
}

/**
 * Sort repos by pushed_at (most recent first)
 */
function sortReposByPushedAt(repos: RepoRecord[]): RepoRecord[] {
  return [...repos].sort((a, b) => {
    const dateA = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
    const dateB = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
    return dateB - dateA; // Descending (newest first)
  });
}

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

/**
 * Load data from background worker
 */
async function loadFromDB() {
  try {
    error.value = '';

    // Load repos from background
    const dbRepos = await sendMessage<RepoRecord[]>(MessageType.GET_ALL_REPOS);
    repos.value = dbRepos;

    // Sort all repos by pushed_at
    const sortedRepos = sortReposByPushedAt(dbRepos);

    // Split into active and stale
    const active: RepoRecord[] = [];
    const stale: RepoRecord[] = [];

    for (const repo of sortedRepos) {
      if (isRepoStale(repo)) {
        stale.push(repo);
      } else {
        active.push(repo);
      }
    }

    activeRepos.value = active;
    staleRepos.value = stale;

    // Load counts for all repos
    await loadCounts();

    // Update sync status display
    await updateSyncStatusDisplay();

    // Update rate limit info
    await updateRateLimitDisplay();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load data from DB';
    console.error('Failed to load from DB:', e);
  }
}

/**
 * Update rate limit display
 */
async function updateRateLimitDisplay() {
  const limit = await sendMessage<RateLimitInfo | null>(MessageType.GET_RATE_LIMIT);
  if (limit) {
    rateLimit.value = limit;
  }
}

/**
 * Get rate limit status for dot indicator
 */
function getRateLimitStatus(): 'good' | 'warning' | 'limited' {
  if (!rateLimit.value) return 'good';
  const remaining = rateLimit.value.remaining;
  if (remaining < 100) return 'limited';
  if (remaining < 500) return 'warning';
  return 'good';
}

/**
 * Load issue and PR counts for each repo from background
 */
async function loadCounts() {
  const counts: Record<number, { issues: number; prs: number }> = {};

  // Load counts in parallel for better performance
  await Promise.all(
    repos.value.map(async (repo) => {
      const [issues, prs] = await Promise.all([
        sendMessage(MessageType.GET_ISSUES_BY_REPO, repo.id),
        sendMessage(MessageType.GET_PRS_BY_REPO, repo.id),
      ]);
      counts[repo.id] = {
        issues: issues.length,
        prs: prs.length,
      };
    }),
  );

  repoCounts.value = counts;
}

/**
 * Update sync status display
 */
async function updateSyncStatusDisplay() {
  const status = await sendMessage<SyncStatus>(MessageType.GET_SYNC_STATUS);
  isSyncing.value = status.isRunning;

  const account = status.accountLogin ? `@${status.accountLogin}` : 'Account';

  if (status.isRunning) {
    const { activeRepos, issuesProgress, prsProgress } = status.progress;

    if (activeRepos === 0) {
      // Still fetching repos
      syncStatus.value = `${account}: Fetching repositories...`;
    } else if (issuesProgress === 0 && prsProgress === 0) {
      // Repos fetched, starting to sync issues/PRs
      syncStatus.value = `${account}: ${activeRepos} repos, starting sync...`;
    } else {
      // Syncing issues and PRs
      syncStatus.value = `${account}: ${activeRepos} repos, syncing issues ${issuesProgress}/${activeRepos}, PRs ${prsProgress}/${activeRepos}`;
    }
  } else if (status.lastCompletedAt) {
    const timeAgo = Math.round((Date.now() - status.lastCompletedAt) / 1000 / 60);
    const { activeRepos } = status.progress;
    const repoText = activeRepos > 0 ? `${activeRepos} repos` : 'repos';
    const timeText = timeAgo === 0 ? 'just now' : `${timeAgo}m ago`;
    syncStatus.value = `${account}: ${repoText}, synced ${timeText}`;
  } else {
    syncStatus.value = 'Not synced yet';
  }
}

/**
 * Manually trigger a sync
 */
async function triggerSync() {
  try {
    await sendMessage(MessageType.FORCE_SYNC);
    // Reload data after sync completes
    await loadFromDB();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Sync failed';
    console.error('Manual sync failed:', e);
  }
}

async function show() {
  isVisible.value = true;
  // Always load from DB immediately (fast, no API calls)
  await loadFromDB();
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

// Auto-reload data when component mounts (content script loads)
onMounted(async () => {
  // Silently load data in background so it's ready when user opens overlay
  await loadFromDB();
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
  padding: 30px;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e1e4e8;
}

.gitjump-popup h2 {
  margin: 0;
  font-size: 24px;
}

.header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #586069;
}

.rate-limit-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #6a737d;
}

.rate-limit-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  position: relative;
}

.rate-limit-dot.good {
  background: #28a745;
  box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2);
}

.rate-limit-dot.warning {
  background: #dbab09;
  box-shadow: 0 0 0 2px rgba(219, 171, 9, 0.2);
  animation: pulse-warning 2s ease-in-out infinite;
}

.rate-limit-dot.limited {
  background: #d73a49;
  box-shadow: 0 0 0 2px rgba(215, 58, 73, 0.2);
  animation: pulse-critical 1s ease-in-out infinite;
}

.rate-limit-label {
  font-weight: 500;
}

@keyframes pulse-warning {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@keyframes pulse-critical {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
}

.sync-status .syncing {
  color: #0366d6;
  font-weight: 600;
}

.sync-button {
  padding: 4px 10px;
  font-size: 12px;
  background: #f6f8fa;
  border: 1px solid #d1d5da;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  color: #24292e;
  transition: background 0.2s;
}

.sync-button:hover {
  background: #e1e4e8;
}

.status {
  padding: 20px;
  text-align: center;
  color: #586069;
}

.status.error {
  color: #d73a49;
}

.repos-container {
  display: flex;
  flex-direction: column;
  gap: 0;
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
</style>
