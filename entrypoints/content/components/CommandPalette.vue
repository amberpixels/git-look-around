<template>
  <div v-if="panelMode !== 'HIDDEN'" class="gitjump-overlay" @click="handleBackdropClick">
    <div class="gitjump-popup" :class="{ 'dark-theme': isDarkTheme }">
      <!-- (1) Search input bar -->
      <div class="search-bar">
        <svg v-if="!dataLoading" class="search-icon" viewBox="0 0 16 16" width="16" height="16">
          <path
            d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"
          ></path>
        </svg>
        <svg v-else class="spinner-icon" viewBox="0 0 16 16" width="16" height="16">
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            opacity="0.25"
          />
          <path
            d="M 8 2 A 6 6 0 0 1 14 8"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="search-input"
          :placeholder="searchPlaceholder"
          @focus="enterFilteredMode"
          @blur="handleInputBlur"
          @input="handleSearchInput"
        />
      </div>

      <!-- (2) Main content: unified results list -->
      <div v-if="reposError" class="status error">{{ reposError }}</div>
      <div v-else-if="repos.length === 0 && !dataLoading" class="status empty-state">
        No repos in database yet. Sync will happen automatically.
      </div>

      <div v-else class="results-container">
        <!-- Unified flat list of repos, PRs, and issues -->
        <ul v-if="filteredResults.length > 0" class="results-list">
          <li
            v-for="(item, index) in filteredResults"
            :key="item.id"
            :ref="(el) => setItemRef(item.id, el)"
            class="result-item"
            :class="{
              focused: isItemFocused(index),
              'type-repo': item.type === 'repo',
              'type-pr': item.type === 'pr',
              'type-issue': item.type === 'issue',
              'state-open': item.state === 'open',
              'state-closed': item.state === 'closed',
            }"
          >
            <!-- Repo result -->
            <template v-if="item.type === 'repo'">
              <div class="result-icon">
                <svg
                  v-if="getRepoById(item.entityId)?.private"
                  class="icon-private"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path
                    d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z"
                  ></path>
                </svg>
                <svg
                  v-else-if="getRepoById(item.entityId)?.fork"
                  class="icon-fork"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path
                    d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"
                  ></path>
                </svg>
                <svg v-else class="icon-public" viewBox="0 0 16 16" width="16" height="16">
                  <path
                    d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"
                  ></path>
                </svg>
              </div>
              <div class="result-content repo-content">
                <a :href="item.url" class="result-title" @click="handleRepoClick">
                  {{ item.title }}
                </a>
                <div
                  v-if="
                    repoCounts[item.entityId] &&
                    (preferences.syncIssues || preferences.syncPullRequests)
                  "
                  class="repo-counts-inline"
                >
                  <span v-if="preferences.syncPullRequests" class="count-badge-inline prs">
                    <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
                      <path
                        d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
                      ></path>
                    </svg>
                    {{ repoCounts[item.entityId].prs }}
                  </span>
                </div>
              </div>
            </template>

            <!-- PR result -->
            <template v-else-if="item.type === 'pr'">
              <div class="result-icon">
                <!-- PR: Draft -->
                <svg
                  v-if="item.draft"
                  class="icon-pr icon-draft"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path
                    d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"
                  ></path>
                </svg>
                <!-- PR: Merged -->
                <svg
                  v-else-if="item.merged"
                  class="icon-pr icon-merged"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path
                    d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"
                  ></path>
                </svg>
                <!-- PR: Open -->
                <svg
                  v-else-if="item.state === 'open'"
                  class="icon-pr icon-open"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path
                    d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
                  ></path>
                </svg>
                <!-- PR: Closed -->
                <svg v-else class="icon-pr icon-closed" viewBox="0 0 16 16" width="16" height="16">
                  <path
                    d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
                  ></path>
                </svg>
              </div>
              <div class="result-content">
                <a :href="item.url" class="result-title" @click="handleRepoClick">
                  <span class="result-number">#{{ item.number }}</span>
                  {{ item.title }}
                </a>
                <div class="result-meta">
                  <img
                    v-if="item.user"
                    :src="item.user.avatar_url"
                    :alt="item.user.login"
                    :title="`Opened by @${item.user.login}`"
                    class="user-avatar"
                  />
                  <span class="repo-parent">in {{ item.repoName }}</span>
                </div>
              </div>
            </template>

            <!-- Issue result -->
            <template v-else-if="item.type === 'issue'">
              <div class="result-icon">
                <svg
                  class="icon-issue"
                  :class="item.state === 'open' ? 'icon-open' : 'icon-closed'"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
                  <path
                    d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
                  ></path>
                </svg>
              </div>
              <div class="result-content">
                <a :href="item.url" class="result-title" @click="handleRepoClick">
                  <span class="result-number">#{{ item.number }}</span>
                  {{ item.title }}
                </a>
                <div class="result-meta">
                  <img
                    v-if="item.user"
                    :src="item.user.avatar_url"
                    :alt="item.user.login"
                    :title="`Opened by @${item.user.login}`"
                    class="user-avatar"
                  />
                  <span class="repo-parent">in {{ item.repoName }}</span>
                </div>
              </div>
            </template>
          </li>
        </ul>

        <!-- Non-indexed repos separator and list -->
        <div v-if="filteredNonIndexedRepos.length > 0" class="non-indexed-section">
          <div class="non-indexed-separator">Not indexed (click + to add)</div>
          <ul class="results-list non-indexed-repos">
            <li
              v-for="repo in filteredNonIndexedRepos"
              :key="`non-indexed-${repo.id}`"
              class="result-item type-repo non-indexed"
              :title="repo.description || ''"
            >
              <div class="result-icon">
                <svg
                  v-if="repo.private"
                  class="icon-private"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path
                    d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z"
                  ></path>
                </svg>
                <svg
                  v-else-if="repo.fork"
                  class="icon-fork"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <path
                    d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"
                  ></path>
                </svg>
                <svg v-else class="icon-public" viewBox="0 0 16 16" width="16" height="16">
                  <path
                    d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"
                  ></path>
                </svg>
              </div>
              <div class="result-content">
                <a :href="repo.html_url" class="result-title" @click="handleRepoClick">
                  {{ repo.full_name }}
                </a>
              </div>
              <button
                class="add-to-index-btn"
                title="Add to index (will sync issues/PRs)"
                @click.prevent="addRepoToIndex(repo.id)"
              >
                <svg viewBox="0 0 16 16" width="14" height="14">
                  <path
                    d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"
                  ></path>
                </svg>
              </button>
            </li>
          </ul>
        </div>

        <!-- No results message -->
        <div
          v-if="searchQuery && filteredResults.length === 0 && filteredNonIndexedRepos.length === 0"
          class="status empty-state"
        >
          No results match "{{ searchQuery }}"
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
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import { useRepos } from '@/src/composables/useRepos';
import { useSyncStatus } from '@/src/composables/useSyncStatus';
import { useRateLimit } from '@/src/composables/useRateLimit';
import { useSyncPreferences } from '@/src/composables/useSyncPreferences';
import { useBackgroundMessage } from '@/src/composables/useBackgroundMessage';
import { useKeyboardShortcuts } from '@/src/composables/useKeyboardShortcuts';
import { useUnifiedSearch, type SearchResultItem } from '@/src/composables/useUnifiedSearch';
import { MessageType } from '@/src/messages/types';
import type { RepoRecord, IssueRecord, PullRequestRecord } from '@/src/types';
import { getCachedTheme, setCachedTheme, type ThemeMode } from '@/src/storage/chrome';

const searchQuery = ref(''); // Immediate input value (updates on every keystroke)

const debouncedSearchQuery = ref(''); // Debounced value (used for filtering to prevent lag)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchInputRef = ref<any>(null);
const isDarkTheme = ref(false);

// Panel modes: NORMAL (unfocused list), FILTERED (focused search), or HIDDEN (closed)
type PanelMode = 'NORMAL' | 'FILTERED' | 'HIDDEN';
const panelMode = ref<PanelMode>('HIDDEN');

// Flag to skip initial focus event (when we programmatically focus on open)
const skipNextFocusEvent = ref(false);

// Use debounced query for filtering to keep typing blazingly fast
const normalizedSearchQuery = computed(() => debouncedSearchQuery.value.trim().toLowerCase());

// Track all PRs and issues by repo for unified search
const allPRsByRepo = ref<Record<number, PullRequestRecord[]>>({});
const allIssuesByRepo = ref<Record<number, IssueRecord[]>>({});
const dataLoading = ref(false);

const itemRefs = new Map<string, HTMLElement | null>();
const focusedIndex = ref(0);

const { sendMessage } = useBackgroundMessage();

// Use composables
const {
  repos,
  indexedRepos,
  error: reposError,
  loadAll: loadReposData,
  addRepoToIndex,
} = useRepos();

const { status: syncStatus } = useSyncStatus(500);
const { rateLimit } = useRateLimit(0);
const { preferences } = useSyncPreferences();
const { searchResults, setEntities } = useUnifiedSearch();

/**
 * Load all PRs and issues for indexed repos
 */
async function loadAllPRsAndIssues() {
  dataLoading.value = true;
  const prsByRepo: Record<number, PullRequestRecord[]> = {};
  const issuesByRepo: Record<number, IssueRecord[]> = {};

  const indexedReposList = indexedRepos.value;

  await Promise.all(
    indexedReposList.map(async (repo) => {
      try {
        const [issues, prs] = await Promise.all([
          preferences.value.syncIssues
            ? sendMessage<IssueRecord[]>(MessageType.GET_ISSUES_BY_REPO, repo.id)
            : Promise.resolve([]),
          preferences.value.syncPullRequests
            ? sendMessage<PullRequestRecord[]>(MessageType.GET_PRS_BY_REPO, repo.id)
            : Promise.resolve([]),
        ]);
        issuesByRepo[repo.id] = issues;
        prsByRepo[repo.id] = prs;
      } catch (err) {
        console.error(`[CommandPalette] Error loading data for repo ${repo.id}:`, err);
        issuesByRepo[repo.id] = [];
        prsByRepo[repo.id] = [];
      }
    }),
  );

  allIssuesByRepo.value = issuesByRepo;
  allPRsByRepo.value = prsByRepo;

  // Update unified search index
  const entities = indexedReposList.map((repo) => ({
    repo,
    issues: issuesByRepo[repo.id] || [],
    prs: prsByRepo[repo.id] || [],
  }));
  setEntities(entities);

  dataLoading.value = false;
}

/**
 * Get repo counts for display
 */
const repoCounts = computed(() => {
  const counts: Record<number, { issues: number; prs: number }> = {};
  for (const repo of indexedRepos.value) {
    counts[repo.id] = {
      issues: allIssuesByRepo.value[repo.id]?.length || 0,
      prs: allPRsByRepo.value[repo.id]?.length || 0,
    };
  }
  return counts;
});

/**
 * Get filtered search results based on current query
 */
const filteredResults = computed(() => {
  const query = normalizedSearchQuery.value;
  const results = searchResults.value(query);

  // Apply quick-switcher logic: hide or deprioritize current repo
  return applyQuickSwitcherLogic(results);
});

/**
 * Non-indexed repos (for the "add to index" section)
 */
const nonIndexedRepos = computed(() => {
  return repos.value.filter((repo) => repo.indexed === false);
});

/**
 * Dynamic search placeholder based on user preferences
 */
const searchPlaceholder = computed(() => {
  const parts = ['repositories'];

  if (preferences.value.syncPullRequests) {
    parts.push('pull requests');
  }

  if (preferences.value.syncIssues) {
    parts.push('issues');
  }

  if (parts.length === 1) {
    return 'Search repositories...';
  } else if (parts.length === 2) {
    return `Search ${parts[0]} and ${parts[1]}...`;
  } else {
    return `Search ${parts[0]}, ${parts[1]}, and ${parts[2]}...`;
  }
});

const filteredNonIndexedRepos = computed(() => {
  const query = normalizedSearchQuery.value;
  if (!query) return nonIndexedRepos.value;

  return nonIndexedRepos.value.filter(
    (repo) =>
      repo.full_name.toLowerCase().includes(query) ||
      (repo.description?.toLowerCase().includes(query) ?? false),
  );
});

/**
 * Detect current GitHub repo from URL
 * Returns full_name like "owner/repo" or null if not on a repo page
 */
function getCurrentRepoFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return null;
}

/**
 * Apply quick-switcher logic: deprioritize or hide current repo
 */
function applyQuickSwitcherLogic(results: SearchResultItem[]): SearchResultItem[] {
  const currentRepoName = getCurrentRepoFromUrl();
  if (!currentRepoName) {
    return results;
  }

  const showingPrsOrIssues = preferences.value.syncIssues || preferences.value.syncPullRequests;

  if (!showingPrsOrIssues) {
    // Hide current repo completely
    return results.filter((item) => {
      if (item.type === 'repo') {
        return item.title !== currentRepoName;
      }
      return item.repoName !== currentRepoName;
    });
  } else {
    // Swap 1st and 2nd if 1st is current repo
    if (results.length >= 2) {
      const first = results[0];
      if (
        (first.type === 'repo' && first.title === currentRepoName) ||
        (first.type !== 'repo' && first.repoName === currentRepoName)
      ) {
        return [results[1], results[0], ...results.slice(2)];
      }
    }
    return results;
  }
}

/**
 * Set item ref for focusing
 */
function setItemRef(itemId: string, el: unknown) {
  if (el instanceof HTMLElement) {
    itemRefs.set(itemId, el);
  } else {
    itemRefs.delete(itemId);
  }
}

/**
 * Check if item is focused
 */
function isItemFocused(index: number): boolean {
  return index === focusedIndex.value;
}

/**
 * Ensure focused item is visible
 */
function ensureFocusVisible() {
  const results = filteredResults.value;
  const item = results[focusedIndex.value];
  if (!item) return;
  const el = itemRefs.get(item.id);
  el?.scrollIntoView({ block: 'nearest' });
}

/**
 * Move focus to next item
 */
function moveNext() {
  const maxIndex = filteredResults.value.length - 1;
  if (focusedIndex.value < maxIndex) {
    focusedIndex.value++;
    nextTick(() => ensureFocusVisible());
  }
}

/**
 * Move focus to previous item
 */
function movePrev() {
  if (focusedIndex.value > 0) {
    focusedIndex.value--;
    nextTick(() => ensureFocusVisible());
  }
}

/**
 * Navigate to focused item
 */
function navigateToFocusedItem(newTab: boolean = false) {
  const item = filteredResults.value[focusedIndex.value];
  if (!item) return;

  if (newTab) {
    window.open(item.url, '_blank');
  } else {
    window.location.href = item.url;
    hide();
  }
}

// Debounce search query to decouple typing from filtering
let debounceTimeout: number | null = null;
watch(searchQuery, (newQuery) => {
  // Clear existing timeout
  if (debounceTimeout) {
    window.clearTimeout(debounceTimeout);
  }

  // Immediate update for empty query to instantly show all repos when clearing
  if (!newQuery.trim()) {
    debouncedSearchQuery.value = '';
    return;
  }

  // Debounce non-empty queries for blazingly fast typing (150ms feels instant)
  debounceTimeout = window.setTimeout(() => {
    debouncedSearchQuery.value = newQuery;
  }, 150);
});

watch(focusedIndex, () => {
  nextTick(() => ensureFocusVisible());
});

watch(filteredResults, () => {
  // Reset focus if current index is out of bounds
  if (focusedIndex.value >= filteredResults.value.length) {
    focusedIndex.value = Math.max(0, filteredResults.value.length - 1);
  }
});

/**
 * Navigate to focused repo or nested row (triggered by Enter key)
 * @param newTab - if true, open in new tab instead of current tab
 */
function navigateToFocusedTarget(newTab: boolean = false) {
  navigateToFocusedItem(newTab);
}

/**
 * Handle text input - trigger FILTERED mode when user starts typing
 */
function handleSearchInput() {
  if (searchQuery.value.trim() && panelMode.value === 'NORMAL') {
    console.warn('[Gitjump] User typed, entering FILTERED mode');
    panelMode.value = 'FILTERED';
  } else if (!searchQuery.value.trim() && panelMode.value === 'FILTERED') {
    console.warn('[Gitjump] Search cleared, returning to NORMAL mode');
    panelMode.value = 'NORMAL';
  }
}

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
    const { indexedRepos, issuesProgress, prsProgress } = status.progress;
    const progress = Math.max(issuesProgress, prsProgress);

    if (indexedRepos === 0) {
      return `${account}: Syncing...`;
    } else {
      const currentRepo = status.progress.currentRepo;
      const repoSuffix = currentRepo ? ` (${currentRepo})` : '';
      return `${account}: Syncing ${progress}/${indexedRepos}${repoSuffix}`;
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
    const { indexedRepos, issuesProgress, prsProgress } = status.progress;
    return `Syncing: ${issuesProgress}/${indexedRepos} issues, ${prsProgress}/${indexedRepos} PRs`;
  } else if (status.lastCompletedAt) {
    const { indexedRepos } = status.progress;
    const date = new Date(status.lastCompletedAt).toLocaleString();
    return `Last synced: ${date} (${indexedRepos} indexed repos)`;
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

/**
 * Panel mode transitions
 */
function enterFilteredMode() {
  console.log('[Gitjump] State: enterFilteredMode', {
    currentMode: panelMode.value,
    skipNextFocusEvent: skipNextFocusEvent.value,
  });
  if (skipNextFocusEvent.value) {
    skipNextFocusEvent.value = false;
    console.log('[Gitjump] Skipping initial focus event');
    return;
  }
  if (panelMode.value === 'NORMAL') {
    panelMode.value = 'FILTERED';
    console.log('[Gitjump] State Change: NORMAL -> FILTERED');
  }
}

function handleInputBlur() {
  // Input blur is handled by other mechanisms (backdrop click, ESC key)
  // We intentionally do nothing here to keep the panel state stable
}

function exitFilteredModeAndClear() {
  console.log('[Gitjump] State: exitFilteredModeAndClear', {
    beforeSearchQuery: searchQuery.value,
  });

  // Clear debounce timeout if pending
  if (debounceTimeout) {
    window.clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }

  searchQuery.value = '';
  debouncedSearchQuery.value = '';
  focusedIndex.value = 0;

  // CRITICAL FIX: We must set panelMode to NORMAL *before* refocusing
  panelMode.value = 'NORMAL';

  // Force focus back to input in case it was lost
  nextTick(() => {
    // Set flag to skip the next focus event so we don't re-enter FILTERED mode
    skipNextFocusEvent.value = true;
    searchInputRef.value?.focus();
  });

  console.log('[Gitjump] State Change: FILTERED -> NORMAL (cleared)', {
    afterSearchQuery: searchQuery.value,
    panelMode: panelMode.value,
  });
}

async function show() {
  console.log('[Gitjump] State: show');

  // Clear any pending debounce
  if (debounceTimeout) {
    window.clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }

  searchQuery.value = '';
  debouncedSearchQuery.value = '';
  focusedIndex.value = 0;
  panelMode.value = 'NORMAL';
  sendMessage(MessageType.SET_QUICK_CHECK_BROWSING);

  // Load repos and all PRs/issues
  await loadReposData();
  await loadAllPRsAndIssues();

  await nextTick();
  skipNextFocusEvent.value = true;
  searchInputRef.value?.focus();
  console.log('[Gitjump] Palette shown, input focused, panelMode =', panelMode.value);
}

function hide() {
  console.log('[Gitjump] State: hide');
  panelMode.value = 'HIDDEN';
  sendMessage(MessageType.SET_QUICK_CHECK_IDLE);
}

async function toggle() {
  if (panelMode.value !== 'HIDDEN') {
    hide();
  } else {
    await show();
  }
}

/**
 * Handle repo link click - close palette on regular click
 * But keep open for middle-click or Cmd/Ctrl+click (new tab)
 */
function handleRepoClick(event: MouseEvent) {
  // Don't close if user is opening in new tab (middle click or Cmd/Ctrl+click)
  if (event.button === 1 || event.ctrlKey || event.metaKey) {
    return;
  }
  // Regular click - close the palette
  hide();
}

/**
 * Get repo by ID (for displaying non-indexed repos)
 */
function getRepoById(repoId: number): RepoRecord | undefined {
  return repos.value.find((r) => r.id === repoId);
}

/**
 * Detect dark theme preference from DOM
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
 * Update theme state and persist to cache
 * This ensures next page load is instant
 */
async function updateTheme() {
  const newTheme = detectDarkTheme();
  const newThemeMode: ThemeMode = newTheme ? 'dark' : 'light';

  // Only update if changed to avoid unnecessary re-renders
  if (isDarkTheme.value !== newTheme) {
    isDarkTheme.value = newTheme;
  }

  // Persist to cache for next page load (non-blocking)
  setCachedTheme(newThemeMode).catch((error) => {
    console.error('[CommandPalette] Failed to cache theme:', error);
  });
}

// Auto-load data when component mounts (content script loads)
onMounted(async () => {
  // CRITICAL: Apply cached theme FIRST for instant rendering (no flash)
  // This happens before any DOM checks or async operations
  const cachedTheme = await getCachedTheme();
  if (cachedTheme) {
    isDarkTheme.value = cachedTheme === 'dark';
  }

  // Silently load data in background so it's ready when user opens overlay
  await loadReposData();

  // Detect actual theme from DOM and update cache if different
  // This happens after initial render, so no flash occurs
  await updateTheme();

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
    // Clear debounce timeout
    if (debounceTimeout) {
      window.clearTimeout(debounceTimeout);
    }
  });
});

// Watch for sync completion to reload PRs/issues if palette is open
watch(
  () => syncStatus.value?.isRunning,
  async (isRunning, wasRunning) => {
    // Sync just completed (was running, now not running)
    if (wasRunning === true && isRunning === false && panelMode.value !== 'HIDDEN') {
      console.log('[CommandPalette] Sync completed, reloading PRs and issues...');
      await loadAllPRsAndIssues();
    }
  },
);

function handleBackdropClick(e: MouseEvent) {
  // Only close if clicking the backdrop, not the popup itself
  if (e.target === e.currentTarget) {
    hide();
  }
}

useKeyboardShortcuts(
  {
    moveNext: () => moveNext(),
    movePrev: () => movePrev(),
    expand: () => {}, // No longer used in flat list
    collapse: () => {}, // No longer used in flat list
    select: (newTab) => navigateToFocusedTarget(newTab),
    dismiss: () => {
      console.log('[Gitjump] Action: dismiss', { panelMode: panelMode.value });
      if (panelMode.value === 'FILTERED') {
        exitFilteredModeAndClear();
        console.log('[Gitjump] After exitFilteredModeAndClear:', {
          searchQuery: searchQuery.value,
          panelMode: panelMode.value,
        });
        searchInputRef.value?.blur();
      } else {
        hide();
      }
    },
    focusInput: () => searchInputRef.value?.focus(),
    onType: (char) => {
      searchInputRef.value?.focus();
      nextTick(() => {
        searchQuery.value += char;
      });
    },
  },
  () => panelMode.value !== 'HIDDEN',
);

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
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 999999;
  padding-top: 15vh;
}

.gitjump-popup {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  width: 100%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* (1) Search bar */
.search-bar {
  padding: 0;
  border-bottom: 1px solid #d0d7de;
  background: white;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}

.search-icon {
  flex-shrink: 0;
  fill: #57606a;
}

.spinner-icon {
  flex-shrink: 0;
  fill: #57606a;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  font-size: 14px;
  font-weight: 400;
  border: none;
  outline: none;
  font-family: inherit;
  background: transparent;
  color: #24292f;
}

.search-input::placeholder {
  color: #57606a;
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

.results-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  flex: 1;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* Result items (flat list) */
.result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid #d0d7de;
  cursor: pointer;
  transition: background-color 0.1s;
}

.result-item.type-repo {
  padding: 6px 16px;
}

.result-item:last-child {
  border-bottom: none;
}

.result-item.focused {
  background: #ddf4ff;
  border-left: 3px solid #0969da;
  padding-left: 13px;
}

.result-item.state-closed {
  opacity: 0.7;
}

.result-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.result-icon svg {
  fill: currentColor;
}

/* Icon colors */
.icon-private {
  color: #bf8700;
}

.icon-fork,
.icon-public {
  color: #57606a;
}

.icon-pr.icon-open {
  color: #1a7f37;
}

.icon-pr.icon-draft {
  color: #57606a;
}

.icon-pr.icon-merged {
  color: #8250df;
}

.icon-pr.icon-closed {
  color: #d1242f;
}

.icon-issue.icon-open {
  color: #0969da;
}

.icon-issue.icon-closed {
  color: #8b949e;
}

.result-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.repo-content {
  flex-direction: row;
  align-items: center;
  gap: 0;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: #24292f;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.repo-content .result-title {
  flex: 1;
  min-width: 0;
}

.result-title:hover {
  color: #0969da;
  text-decoration: none;
}

.result-number {
  color: #57606a;
  font-weight: 600;
  font-size: 13px;
  margin-right: 6px;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #57606a;
}

.user-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.repo-parent {
  color: #57606a;
  font-size: 12px;
}

.repo-counts-inline {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
  margin-left: 12px;
}

.count-badge-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  background: transparent;
  border: 1px solid;
}

.count-badge-inline .icon {
  fill: currentColor;
  flex-shrink: 0;
}

.count-badge-inline.prs {
  color: #1a7f37;
  border-color: #1a7f37;
}

.repo-counts {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
}

.count-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 12px;
  background: #f6f8fa;
  border: 1px solid #d0d7de;
}

.count-badge .icon {
  fill: currentColor;
  flex-shrink: 0;
}

.count-badge.issues {
  color: #0969da;
}

.count-badge.prs {
  color: #1a7f37;
}

/* Non-indexed section */
.non-indexed-section {
  margin-top: 20px;
}

.non-indexed-separator {
  padding: 12px 16px;
  background: #f6f8fa;
  border-top: 2px solid #e1e4e8;
  border-bottom: 1px solid #e1e4e8;
  font-size: 13px;
  font-weight: 600;
  color: #586069;
  text-align: center;
}

.result-item.non-indexed {
  opacity: 0.7;
}

.result-item.non-indexed .result-title {
  color: #6a737d;
}

.add-to-index-btn {
  background: transparent;
  border: 1px solid #d1d5da;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0366d6;
  transition:
    background-color 0.2s,
    border-color 0.2s;
  flex-shrink: 0;
  margin-left: auto;
}

.add-to-index-btn:hover {
  background: #f6f8fa;
  border-color: #0366d6;
}

.add-to-index-btn svg {
  fill: currentColor;
}

/* (3) Status bar */
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-top: 1px solid #e1e4e8;
  background: #fafbfc;
  font-size: 12px;
  flex-shrink: 0;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
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
  background: #1c2128;
  border-color: #444c56;
  color: #e6edf3;
}

.dark-theme .search-bar {
  background: #1c2128;
  border-bottom-color: #444c56;
}

.dark-theme .search-icon,
.dark-theme .spinner-icon {
  fill: #768390;
}

.dark-theme .search-input {
  background: transparent;
  color: #adbac7;
}

.dark-theme .search-input::placeholder {
  color: #768390;
}

.dark-theme .status {
  color: #768390;
}

.dark-theme .status.error {
  color: #f85149;
}

.dark-theme .result-item {
  border-bottom-color: #373e47;
}

.dark-theme .result-item.focused {
  background: #2d3845;
  border-left-color: #539bf5;
}

.dark-theme .result-title {
  color: #adbac7;
}

.dark-theme .result-title:hover {
  color: #539bf5;
}

.dark-theme .result-number,
.dark-theme .result-meta,
.dark-theme .repo-parent {
  color: #768390;
}

.dark-theme .icon-private {
  color: #d29922;
}

.dark-theme .icon-fork,
.dark-theme .icon-public {
  color: #768390;
}

.dark-theme .icon-pr.icon-open {
  color: #56d364;
}

.dark-theme .icon-pr.icon-draft {
  color: #768390;
}

.dark-theme .icon-pr.icon-merged {
  color: #a371f7;
}

.dark-theme .icon-pr.icon-closed {
  color: #f85149;
}

.dark-theme .icon-issue.icon-open {
  color: #539bf5;
}

.dark-theme .icon-issue.icon-closed {
  color: #768390;
}

.dark-theme .count-badge {
  background: #22272e;
  border-color: #444c56;
}

.dark-theme .count-badge.issues {
  color: #539bf5;
}

.dark-theme .count-badge.prs {
  color: #56d364;
}

.dark-theme .count-badge-inline.prs {
  color: #56d364;
  border-color: #56d364;
}

.dark-theme .non-indexed-separator {
  background: #22272e;
  border-top-color: #444c56;
  border-bottom-color: #444c56;
  color: #768390;
}

.dark-theme .result-item.non-indexed .result-title {
  color: #768390;
}

.dark-theme .add-to-index-btn {
  border-color: #444c56;
  color: #539bf5;
}

.dark-theme .add-to-index-btn:hover {
  background: #22272e;
  border-color: #539bf5;
}

.dark-theme .status-bar {
  background: #22272e;
  border-top-color: #444c56;
}

.dark-theme .status-text {
  color: #768390;
}
</style>
