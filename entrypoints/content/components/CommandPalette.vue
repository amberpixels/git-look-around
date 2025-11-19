<template>
  <div v-if="isVisible" class="gitjump-overlay" @click="handleBackdropClick">
    <div class="gitjump-popup" :class="{ 'dark-theme': isDarkTheme }">
      <!-- (1) Search input bar -->
      <div class="search-bar">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="search-input"
          @keydown="handleSearchKeydown"
        />
      </div>

      <!-- (2) Main content: repos list -->
      <div v-if="reposError" class="status error">{{ reposError }}</div>
      <div v-else-if="repos.length === 0" class="status empty-state">
        No repos in database yet. Sync will happen automatically.
      </div>

      <div v-else class="repos-container">
        <!-- Indexed repos (actively synced) -->
        <ul v-if="filteredIndexedRepos.length > 0" class="repos-list">
          <li
            v-for="repo in filteredIndexedRepos"
            :key="repo.id"
            :ref="(el) => setRepoItemRef(repo.id, el)"
            class="repo-item"
            :class="{ focused: isRepoFocused(repo) }"
            :title="repo.description || ''"
          >
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
                <a :href="repo.html_url" class="repo-link" @click="handleRepoClick">
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
                <a
                  v-if="preferences.syncPullRequests"
                  class="count-item prs count-item-link"
                  :href="getPullRequestsUrl(repo)"
                  @click="handleRepoClick"
                >
                  <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
                    <path
                      d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
                    ></path>
                  </svg>
                  {{ repoCounts[repo.id].prs }}
                </a>
              </div>
            </div>
            <div v-if="shouldShowRepoDetails(repo)" class="repo-details">
              <div v-if="isRepoDetailsLoading(repo.id)" class="repo-details-status">
                Loading issues and PRs...
              </div>
              <div v-else-if="getRepoDetailsError(repo.id)" class="repo-details-status error">
                {{ getRepoDetailsError(repo.id) }}
              </div>
              <div
                v-else-if="getVisibleRepoDetailItems(repo).length === 0"
                class="repo-details-status"
              >
                No synced issues or pull requests for this repo.
              </div>
              <ul v-else class="repo-details-list">
                <li
                  v-for="(item, index) in getVisibleRepoDetailItems(repo)"
                  :key="`${item.type}-${item.id}`"
                  :ref="(el) => setDetailRowRef(repo.id, item, el)"
                  class="repo-details-row"
                  :class="{
                    focused: isDetailFocused(repo.id, index),
                    pr: item.type === 'pr',
                    issue: item.type === 'issue',
                    open: item.state === 'open',
                    closed: item.state === 'closed',
                  }"
                >
                  <svg
                    v-if="item.type === 'pr'"
                    class="repo-details-icon pr"
                    :class="item.state"
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                  >
                    <path
                      d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
                    ></path>
                  </svg>
                  <svg
                    v-else
                    class="repo-details-icon issue"
                    :class="item.state"
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                  >
                    <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
                    <path
                      d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
                    ></path>
                  </svg>
                  <div class="repo-details-content">
                    <span class="repo-details-number">#{{ item.number }}</span>
                    <img
                      :src="item.user.avatar_url"
                      :alt="item.user.login"
                      :title="`Opened by @${item.user.login}`"
                      class="repo-details-avatar"
                    />
                    <a :href="item.html_url" class="repo-details-link" @click="handleRepoClick">
                      {{ item.title }}
                    </a>
                  </div>
                </li>
              </ul>
            </div>
          </li>
        </ul>

        <!-- Non-indexed repos separator and list -->
        <div v-if="filteredNonIndexedRepos.length > 0" class="non-indexed-section">
          <div class="non-indexed-separator">Not indexed (click + to add)</div>
          <ul class="repos-list non-indexed-repos">
            <li
              v-for="repo in filteredNonIndexedRepos"
              :key="repo.id"
              :ref="(el) => setRepoItemRef(repo.id, el)"
              class="repo-item"
              :class="{ focused: isRepoFocused(repo) }"
              :title="repo.description || ''"
            >
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
                  <a :href="repo.html_url" class="repo-link" @click="handleRepoClick">
                    {{ repo.full_name }}
                  </a>
                </div>
                <!-- Add to index button (right side) -->
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
              </div>
            </li>
          </ul>
        </div>

        <!-- No results message -->
        <div
          v-if="
            searchQuery && filteredIndexedRepos.length === 0 && filteredNonIndexedRepos.length === 0
          "
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
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import { useRepos } from '@/src/composables/useRepos';
import { useSyncStatus } from '@/src/composables/useSyncStatus';
import { useRateLimit } from '@/src/composables/useRateLimit';
import { useSyncPreferences } from '@/src/composables/useSyncPreferences';
import { useBackgroundMessage } from '@/src/composables/useBackgroundMessage';
import { MessageType } from '@/src/messages/types';
import type { RepoRecord, IssueRecord, PullRequestRecord } from '@/src/types';

const isVisible = ref(false);
const searchQuery = ref('');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchInputRef = ref<any>(null);
const isDarkTheme = ref(false);
const focusedIndex = ref(0); // Index of currently focused repo
const focusMode = ref<'repos' | 'details'>('repos');
const detailFocusIndex = ref(0);
const expandedRepoId = ref<number | null>(null);
const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase());

type RepoDetailData = {
  issues: IssueRecord[];
  prs: PullRequestRecord[];
};

type RepoDetailItem = {
  type: 'issue' | 'pr';
  id: number;
  title: string;
  number: number;
  state: 'open' | 'closed';
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  last_visited_at?: number | null;
  updated_at_ts?: number | null;
};

const repoDetailData = ref<Record<number, RepoDetailData>>({});
const repoDetailLoading = ref<Record<number, boolean>>({});
const repoDetailError = ref<Record<number, string | null>>({});
const detailLoadPromises: Record<number, Promise<void> | null> = {};
const repoItemRefs = new Map<number, HTMLElement | null>();
const detailRowRefs = new Map<string, HTMLElement | null>();

const { sendMessage } = useBackgroundMessage();

// Use composables
const {
  repos,
  indexedRepos,
  nonIndexedRepos,
  repoCounts,
  repoSearchIndex,
  error: reposError,
  loadAll: loadReposData,
  addRepoToIndex,
} = useRepos();

const { status: syncStatus } = useSyncStatus(500); // Poll every 500ms for real-time updates
const { rateLimit } = useRateLimit(0);
const { preferences } = useSyncPreferences();

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
 * - If both PRs and Issues are disabled: hide current repo completely
 * - Otherwise: swap positions of 1st and 2nd repos if 1st is current
 */
function applyQuickSwitcherLogic(reposList: RepoRecord[]): RepoRecord[] {
  const currentRepoName = getCurrentRepoFromUrl();
  if (!currentRepoName) {
    return reposList; // Not on a repo page, show all repos as-is
  }

  const showingPrsOrIssues = preferences.value.syncIssues || preferences.value.syncPullRequests;

  if (!showingPrsOrIssues) {
    // Hide current repo completely
    return reposList.filter((repo) => repo.full_name !== currentRepoName);
  } else {
    // Swap 1st and 2nd if 1st is current repo
    if (reposList.length >= 2 && reposList[0].full_name === currentRepoName) {
      return [reposList[1], reposList[0], ...reposList.slice(2)];
    }
    return reposList;
  }
}

/**
 * Check if repo name or description matches the query (direct match)
 */
function matchesRepoDirectly(repo: RepoRecord, query: string): boolean {
  return (
    repo.full_name.toLowerCase().includes(query) ||
    (repo.description?.toLowerCase().includes(query) ?? false)
  );
}

/**
 * Check if only PRs/issues match the query (indirect match)
 */
function matchesDetailSearch(repo: RepoRecord, query?: string): boolean {
  const actualQuery = query ?? normalizedSearchQuery.value;
  if (!actualQuery) return false;

  const searchEntry = repoSearchIndex.value[repo.id];
  if (!searchEntry) return false;

  if (
    preferences.value.syncPullRequests &&
    searchEntry.prs.some((title) => title.includes(actualQuery))
  ) {
    return true;
  }

  if (
    preferences.value.syncIssues &&
    searchEntry.issues.some((title) => title.includes(actualQuery))
  ) {
    return true;
  }

  return false;
}

/**
 * Filter and sort repos by search query with two-tier ranking:
 * 1. Direct matches (repo name/description) - sorted by visit priority
 * 2. Indirect matches (only PRs/issues) - sorted by visit priority
 */
function filterRepos(reposList: RepoRecord[]): RepoRecord[] {
  const query = normalizedSearchQuery.value;
  if (!query) {
    return reposList;
  }

  // Split into direct and indirect matches
  const directMatches: RepoRecord[] = [];
  const indirectMatches: RepoRecord[] = [];

  for (const repo of reposList) {
    if (matchesRepoDirectly(repo, query)) {
      directMatches.push(repo);
    } else if (matchesDetailSearch(repo, query)) {
      indirectMatches.push(repo);
    }
  }

  // Return direct matches first, then indirect matches
  // Both groups maintain their original visit/recency sorting from reposList
  return [...directMatches, ...indirectMatches];
}

// Filtered repo lists with quick-switcher logic applied
const filteredIndexedRepos = computed(() => {
  const filtered = filterRepos(indexedRepos.value);
  return applyQuickSwitcherLogic(filtered);
});

const filteredNonIndexedRepos = computed(() => filterRepos(nonIndexedRepos.value));

/**
 * All visible repos combined (indexed + non-indexed)
 */
const allVisibleRepos = computed(() => [
  ...filteredIndexedRepos.value,
  ...filteredNonIndexedRepos.value,
]);

const expandedDetailItems = computed(() => {
  if (!expandedRepoId.value) return [];
  const filterQuery = normalizedSearchQuery.value || undefined;
  return getRepoDetailItems(expandedRepoId.value, filterQuery);
});

/**
 * Check if a repo is focused
 */
function isRepoFocused(repo: RepoRecord): boolean {
  const visibleRepos = allVisibleRepos.value;
  const index = visibleRepos.findIndex((r) => r.id === repo.id);
  return index === focusedIndex.value;
}

function isRepoExpanded(repo: RepoRecord): boolean {
  return expandedRepoId.value === repo.id;
}

function isRepoDetailsLoading(repoId: number): boolean {
  return repoDetailLoading.value[repoId] ?? false;
}

function getRepoDetailsError(repoId: number): string | null {
  return repoDetailError.value[repoId] ?? null;
}

function shouldShowRepoDetails(repo: RepoRecord): boolean {
  if (isRepoExpanded(repo)) return true;
  if (repo.indexed === false) return false;
  // In FILTERED mode, auto-show details if PRs/issues match
  const query = normalizedSearchQuery.value;
  return query ? matchesDetailSearch(repo, query) : false;
}

function setRepoItemRef(repoId: number, el: unknown) {
  if (el instanceof HTMLElement) {
    repoItemRefs.set(repoId, el);
  } else {
    repoItemRefs.delete(repoId);
  }
}

function getDetailRowKey(repoId: number, item: RepoDetailItem): string {
  return `${repoId}-${item.type}-${item.id}`;
}

function setDetailRowRef(repoId: number, item: RepoDetailItem, el: unknown) {
  const key = getDetailRowKey(repoId, item);
  if (el instanceof HTMLElement) {
    detailRowRefs.set(key, el);
  } else {
    detailRowRefs.delete(key);
  }
}

function toRepoDetailItem(
  record: IssueRecord | PullRequestRecord,
  type: 'issue' | 'pr',
): RepoDetailItem {
  return {
    type,
    id: record.id,
    title: record.title,
    number: record.number,
    state: record.state,
    html_url: record.html_url,
    user: record.user,
    last_visited_at: record.last_visited_at ?? null,
    updated_at_ts: record.updated_at ? new Date(record.updated_at).getTime() : null,
  };
}

function sortDetailItems(items: RepoDetailItem[]): RepoDetailItem[] {
  return [...items].sort((a, b) => {
    if (a.state !== b.state) {
      return a.state === 'open' ? -1 : 1;
    }

    const visitedA = a.last_visited_at ?? 0;
    const visitedB = b.last_visited_at ?? 0;
    if (visitedA && visitedB && visitedA !== visitedB) {
      return visitedB - visitedA;
    }
    if (visitedA && !visitedB) return -1;
    if (!visitedA && visitedB) return 1;

    const updatedA = a.updated_at_ts ?? 0;
    const updatedB = b.updated_at_ts ?? 0;
    return updatedB - updatedA;
  });
}

function getRepoDetailItems(repoId: number, filterQuery?: string): RepoDetailItem[] {
  const data = repoDetailData.value[repoId];
  if (!data) return [];

  const items: RepoDetailItem[] = [];

  if (preferences.value.syncPullRequests) {
    items.push(...data.prs.map((pr) => toRepoDetailItem(pr, 'pr')));
  }

  if (preferences.value.syncIssues) {
    items.push(...data.issues.map((issue) => toRepoDetailItem(issue, 'issue')));
  }

  let sorted = sortDetailItems(items);
  if (filterQuery) {
    const query = filterQuery.toLowerCase();
    sorted = sorted.filter((item) => item.title.toLowerCase().includes(query));
  }
  return sorted;
}

function getVisibleRepoDetailItems(repo: RepoRecord): RepoDetailItem[] {
  // In FILTERED mode (search active), always show filtered items even when manually expanded
  // In NORMAL mode (no search), show all items
  const filterQuery = normalizedSearchQuery.value;
  return getRepoDetailItems(repo.id, filterQuery || undefined);
}

function ensureRepoFocusVisible() {
  if (focusMode.value !== 'repos') return;
  const repo = allVisibleRepos.value[focusedIndex.value];
  if (!repo) return;
  const el = repoItemRefs.get(repo.id);
  el?.scrollIntoView({ block: 'nearest' });
}

function ensureDetailFocusVisible() {
  if (focusMode.value !== 'details' || !expandedRepoId.value) return;
  const items = expandedDetailItems.value;
  const item = items[detailFocusIndex.value];
  if (!item) return;
  const key = getDetailRowKey(expandedRepoId.value, item);
  const el = detailRowRefs.get(key);
  el?.scrollIntoView({ block: 'nearest' });
}

function isDetailFocused(repoId: number, index: number): boolean {
  return (
    focusMode.value === 'details' &&
    expandedRepoId.value === repoId &&
    detailFocusIndex.value === index
  );
}

async function ensureRepoDetails(repo: RepoRecord) {
  const repoId = repo.id;

  if (repoDetailData.value[repoId]) {
    return;
  }

  if (detailLoadPromises[repoId]) {
    await detailLoadPromises[repoId];
    return;
  }

  // Create promise immediately to prevent race condition
  const loadPromise = (async () => {
    repoDetailLoading.value = { ...repoDetailLoading.value, [repoId]: true };
    repoDetailError.value = { ...repoDetailError.value, [repoId]: null };

    try {
      const [issues, prs] = await Promise.all([
        sendMessage<IssueRecord[]>(MessageType.GET_ISSUES_BY_REPO, repoId),
        sendMessage<PullRequestRecord[]>(MessageType.GET_PRS_BY_REPO, repoId),
      ]);

      repoDetailData.value = {
        ...repoDetailData.value,
        [repoId]: {
          issues,
          prs,
        },
      };
    } catch (error) {
      repoDetailError.value = {
        ...repoDetailError.value,
        [repoId]: error instanceof Error ? error.message : 'Failed to load repo activity',
      };
    } finally {
      repoDetailLoading.value = { ...repoDetailLoading.value, [repoId]: false };
      detailLoadPromises[repoId] = null;
    }
  })();

  detailLoadPromises[repoId] = loadPromise;
  await loadPromise;
}

async function expandFocusedRepo() {
  if (!preferences.value.syncIssues && !preferences.value.syncPullRequests) {
    return;
  }

  const repo = allVisibleRepos.value[focusedIndex.value];
  if (!repo || repo.indexed === false) {
    return;
  }

  expandedRepoId.value = repo.id;
  focusMode.value = 'details';
  detailFocusIndex.value = 0;

  await ensureRepoDetails(repo);

  const items = getVisibleRepoDetailItems(repo);
  if (items.length === 0 && !isRepoDetailsLoading(repo.id)) {
    collapseExpandedRepo();
  } else {
    await nextTick();
    ensureDetailFocusVisible();
  }
}

function collapseExpandedRepo() {
  expandedRepoId.value = null;
  detailFocusIndex.value = 0;
  focusMode.value = 'repos';
  nextTick(() => ensureRepoFocusVisible());
}

watch(expandedDetailItems, (items) => {
  if (focusMode.value !== 'details') return;
  if (items.length === 0) {
    detailFocusIndex.value = 0;
    return;
  }

  if (detailFocusIndex.value >= items.length) {
    detailFocusIndex.value = items.length - 1;
  }
});

watch(allVisibleRepos, () => {
  if (!expandedRepoId.value) return;
  const stillVisible = allVisibleRepos.value.some((repo) => repo.id === expandedRepoId.value);
  if (!stillVisible) {
    collapseExpandedRepo();
  }
});

watch(normalizedSearchQuery, (query) => {
  if (!query) return;
  // Only preload details for visible filtered repos (not all indexed repos)
  const visibleRepos = [...filteredIndexedRepos.value, ...filteredNonIndexedRepos.value];
  visibleRepos.forEach((repo) => {
    if (
      matchesDetailSearch(repo, query) &&
      !repoDetailData.value[repo.id] &&
      !repoDetailLoading.value[repo.id]
    ) {
      void ensureRepoDetails(repo);
    }
  });
});

watch([focusedIndex, focusMode], () => {
  nextTick(() => ensureRepoFocusVisible());
});

watch([detailFocusIndex, focusMode, expandedRepoId], () => {
  nextTick(() => ensureDetailFocusVisible());
});

/**
 * Navigate focus up/down with arrow keys
 */
function moveFocus(direction: 'up' | 'down') {
  if (focusMode.value === 'details' && expandedRepoId.value) {
    const items = expandedDetailItems.value;
    if (items.length === 0) {
      collapseExpandedRepo();
    } else {
      if (direction === 'down') {
        detailFocusIndex.value = Math.min(detailFocusIndex.value + 1, items.length - 1);
      } else {
        detailFocusIndex.value = Math.max(detailFocusIndex.value - 1, 0);
      }
      return;
    }
  }

  const maxIndex = allVisibleRepos.value.length - 1;
  if (maxIndex < 0) return;

  if (direction === 'down') {
    focusedIndex.value = Math.min(focusedIndex.value + 1, maxIndex);
  } else {
    focusedIndex.value = Math.max(focusedIndex.value - 1, 0);
  }
}

/**
 * Navigate to focused repo or nested row (triggered by Enter key)
 * @param newTab - if true, open in new tab instead of current tab
 */
function navigateToFocusedTarget(newTab: boolean = false) {
  let url: string | null = null;

  if (focusMode.value === 'details' && expandedRepoId.value) {
    const items = expandedDetailItems.value;
    const item = items[detailFocusIndex.value];
    if (item) {
      url = item.html_url;
    }
  } else {
    const repo = allVisibleRepos.value[focusedIndex.value];
    if (repo) {
      url = repo.html_url;
    }
  }

  if (url) {
    if (newTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
      hide();
    }
  }
}

/**
 * Handle keyboard navigation in search input
 */
function handleSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveFocus('down');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveFocus('up');
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    void expandFocusedRepo();
  } else if (e.key === 'ArrowLeft' && expandedRepoId.value !== null) {
    e.preventDefault();
    collapseExpandedRepo();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    // Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux) opens in new tab
    const newTab = e.metaKey || e.ctrlKey;
    navigateToFocusedTarget(newTab);
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
      return `${account}: Syncing ${progress}/${indexedRepos}`;
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

async function show() {
  isVisible.value = true;
  searchQuery.value = ''; // Reset search on open
  focusedIndex.value = 0; // Reset focus to first item
  // Switch to browsing mode for faster polling
  sendMessage(MessageType.SET_QUICK_CHECK_BROWSING);
  // Load data immediately
  await loadReposData();
  // Focus input field
  await nextTick();
  searchInputRef.value?.focus();
  ensureRepoFocusVisible();
}

function hide() {
  isVisible.value = false;
  collapseExpandedRepo();
  // Switch back to idle mode for slower polling
  sendMessage(MessageType.SET_QUICK_CHECK_IDLE);
}

async function toggle() {
  if (isVisible.value) {
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

function getPullRequestsUrl(repo: RepoRecord): string {
  const baseUrl = repo.html_url.endsWith('/') ? repo.html_url.slice(0, -1) : repo.html_url;
  return `${baseUrl}/pulls`;
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
  if (!isVisible.value) return;

  const isSearchFocused = document.activeElement === searchInputRef.value;

  console.warn('[Keydown]', e.key, { isSearchFocused, searchQuery: searchQuery.value, activeElement: document.activeElement });

  if (e.key === 'Escape') {
    // Smart Escape cascade:
    // 1. If in Tab-focus mode (focus somewhere else) → return to normal mode (focus on list)
    // 2. If in filtered mode (search has text) → clear search and switch to normal mode
    // 3. If in normal mode → hide palette

    if (!isSearchFocused) {
      // Tab-focus mode: return to normal mode (focus on list, not search)
      console.warn('[Escape] Tab-focus mode -> blur');
      e.preventDefault();
      // Blur any focused element and keep focus on list
      (document.activeElement as HTMLElement)?.blur();
    } else if (searchQuery.value.trim()) {
      // Filtered mode: clear search and switch to normal mode
      console.warn('[Escape] Filtered mode -> clear and blur');
      e.preventDefault();
      searchQuery.value = '';
      focusedIndex.value = 0;
      detailFocusIndex.value = 0;
      focusMode.value = 'repos';
      collapseExpandedRepo();
      // Blur search input to enter normal mode (focus on list)
      searchInputRef.value?.blur();
    } else {
      // Normal mode (search input focused but empty): blur to enter list mode
      console.warn('[Escape] Empty search -> blur');
      e.preventDefault();
      searchInputRef.value?.blur();
    }
    return;
  }

  // Handle navigation keys in normal mode (when search input is not focused)
  if (!isSearchFocused) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus('down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus('up');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      void expandFocusedRepo();
    } else if (e.key === 'ArrowLeft' && expandedRepoId.value !== null) {
      e.preventDefault();
      collapseExpandedRepo();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const newTab = e.metaKey || e.ctrlKey;
      navigateToFocusedTarget(newTab);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Any printable character: focus search and let it type
      searchInputRef.value?.focus();
      // Don't prevent default - let the character be typed
    }
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
  align-items: flex-start;
  justify-content: center;
  z-index: 999999;
  padding-top: 15vh;
}

.gitjump-popup {
  background: white;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  width: 100%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* (1) Search bar - styled as "zeroth row" */
.search-bar {
  padding: 0;
  border-bottom: 1px solid #e1e4e8;
  background: white;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  padding-left: 32px; /* Align with repo names (12px base + 14px icon + 6px gap) */
  font-size: 14px;
  font-weight: 600;
  border: none;
  outline: none;
  font-family: inherit;
  background: transparent;
  color: #0366d6;
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

.non-indexed-repos .repo-item {
  opacity: 0.7;
}

.non-indexed-repos .repo-link {
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
}

.add-to-index-btn:hover {
  background: #f6f8fa;
  border-color: #0366d6;
}

.add-to-index-btn svg {
  fill: currentColor;
}

.repo-item {
  padding: 8px 12px;
  border-bottom: 1px solid #e1e4e8;
}

.repo-item:last-child {
  border-bottom: none;
}

.repo-item.focused {
  background: #ddf4ff;
  box-shadow: inset 3px 0 0 #0969da;
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

.count-item-link {
  background: #ecfdf3;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s;
  text-decoration: none;
}

.count-item-link:hover {
  background: #d1fae5;
  border-color: #34d399;
  text-decoration: none;
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

.repo-details {
  margin-top: 8px;
  padding-left: 0;
  background: #f6f8fa;
  margin-left: -12px;
  margin-right: -12px;
  padding-left: 12px;
  padding-right: 12px;
  padding-bottom: 8px;
}

.repo-details-status {
  font-size: 12px;
  color: #57606a;
  padding: 6px 0;
}

.repo-details-status.error {
  color: #d73a49;
}

.repo-details-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 6px;
}

.repo-details-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  transition: background-color 0.2s;
}

.repo-details-row.focused {
  background: #ddf4ff;
  box-shadow: inset 3px 0 0 #0969da;
}

/* Ensure closed items are still clearly visible when focused */
.repo-details-row.closed.focused {
  background: #ddf4ff;
}

.repo-details-row.closed {
  background: transparent;
  color: #8b949e;
}

.repo-details-icon {
  flex-shrink: 0;
  fill: currentColor;
}

.repo-details-icon.pr.open {
  color: #1a7f37;
}

.repo-details-icon.pr.closed {
  color: #8b949e;
}

.repo-details-icon.issue.open {
  color: #0969da;
}

.repo-details-icon.issue.closed {
  color: #8b949e;
}

.repo-details-content {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.repo-details-number {
  font-size: 11px;
  font-weight: 600;
  color: #57606a;
  white-space: nowrap;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  min-width: 42px;
  text-align: left;
  flex-shrink: 0;
}

.repo-details-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.repo-details-link {
  font-size: 12px;
  color: #24292e;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.repo-details-link:hover {
  text-decoration: underline;
}

.repo-details-row.closed .repo-details-link {
  color: #8b949e;
}

.repo-details-row.closed .repo-details-number {
  color: #8b949e;
}

.dark-theme .repo-details {
  background: #0d1117;
}

.dark-theme .repo-details-row {
  background: transparent;
}

.dark-theme .repo-details-row.focused {
  background: #1c3a5e;
  box-shadow: inset 3px 0 0 #58a6ff;
}

.dark-theme .repo-details-row.closed.focused {
  background: #1c3a5e;
}

.dark-theme .repo-details-row.closed {
  background: transparent;
}

.dark-theme .repo-details-icon.pr.open {
  color: #3fb950;
}

.dark-theme .repo-details-icon.issue.open {
  color: #58a6ff;
}

.dark-theme .repo-details-number {
  color: #8b949e;
}

.dark-theme .repo-details-link {
  color: #dfe3ec;
}

.dark-theme .repo-details-row.closed .repo-details-link {
  color: #8b949e;
}

.dark-theme .repo-details-row.closed .repo-details-number {
  color: #6e7681;
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
  flex: 1;
  min-width: 0;
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
  background: #0d1117;
  color: #e6edf3;
}

.dark-theme .search-bar {
  background: #0d1117;
  border-bottom-color: #30363d;
}

.dark-theme .search-input {
  background: transparent;
  color: #58a6ff;
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

.dark-theme .non-indexed-separator {
  background: #161b22;
  border-top-color: #30363d;
  border-bottom-color: #30363d;
  color: #7d8590;
}

.dark-theme .repo-item {
  border-bottom-color: #21262d;
}

.dark-theme .repo-item.focused {
  background: #1c3a5e;
  box-shadow: inset 3px 0 0 #58a6ff;
}

.dark-theme .repo-link {
  color: #58a6ff;
}

.dark-theme .non-indexed-repos .repo-link {
  color: #7d8590;
}

.dark-theme .add-to-index-btn {
  border-color: #30363d;
  color: #58a6ff;
}

.dark-theme .add-to-index-btn:hover {
  background: #161b22;
  border-color: #58a6ff;
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
