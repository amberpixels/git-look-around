<template>
  <div v-if="panelMode !== 'HIDDEN'" class="git-look-around-overlay" @click="handleBackdropClick">
    <div class="git-look-around-popup" :class="{ 'dark-theme': isDarkTheme }">
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
        <span v-if="repoFilter" class="repo-filter-prefix">
          {{ formatRepoName(repoFilter.full_name) }} ›
        </span>
        <div class="input-wrapper">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="search-input"
            :placeholder="searchPlaceholder"
            @focus="enterFilteredMode"
            @blur="handleInputBlur"
            @input="handleSearchInput"
            @keydown.delete="handleBackspace"
          />
          <!-- Ghost text hint for first result -->
          <div v-if="showGhostText" class="ghost-text-overlay">
            <span class="ghost-text-invisible">{{ searchQuery }}</span>
            <span class="ghost-text-visible">{{ ghostTextSuffix }}</span>
          </div>
        </div>
        <!-- Filter: Only My Contributions -->
        <button
          v-if="shouldShowFilterButton"
          class="filter-button"
          :class="{ active: showOnlyMyContributions }"
          :title="
            showOnlyMyContributions
              ? 'Showing only my contributions (click to show all)'
              : 'Show all (click to filter only my contributions)'
          "
          @click="toggleMyContributionsFilter"
        >
          <!-- Avatar stack: show multiple avatars in "All" mode -->
          <div v-if="!showOnlyMyContributions" class="avatar-stack">
            <img
              v-if="syncStatus?.accountLogin"
              :src="`https://github.com/${syncStatus.accountLogin}.png?size=40`"
              class="filter-avatar stack-avatar"
              :alt="syncStatus.accountLogin"
              :style="{ zIndex: 3 }"
            />
            <img
              v-for="(username, index) in otherContributors"
              :key="username"
              :src="`https://github.com/${username}.png?size=40`"
              class="filter-avatar stack-avatar"
              :alt="username"
              :style="{ zIndex: 2 - index, transform: `translateX(${(index + 1) * 45}%)` }"
            />
          </div>
          <!-- Single avatar: show only mine in "Only mine" mode -->
          <img
            v-else-if="syncStatus?.accountLogin"
            :src="`https://github.com/${syncStatus.accountLogin}.png?size=40`"
            class="filter-avatar"
            :alt="syncStatus.accountLogin"
          />
          <svg v-else viewBox="0 0 16 16" width="16" height="16">
            <path
              d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"
            />
          </svg>
          <span class="filter-label">{{ showOnlyMyContributions ? 'Just me' : 'All' }}</span>
        </button>
        <!-- Filter: Only Visited -->
        <button
          class="filter-button"
          :class="{ active: showOnlyVisited }"
          :title="
            showOnlyVisited
              ? 'Showing only visited items (click to show all)'
              : 'Show all (click to show only visited)'
          "
          @click="toggleVisitedFilter"
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <path
              d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"
            />
          </svg>
          <span class="filter-label">{{ showOnlyVisited ? 'Visited' : 'All' }}</span>
        </button>
      </div>

      <!-- (2) Main content: unified results list -->
      <div v-if="reposError" class="status error">{{ reposError }}</div>
      <div v-else-if="repos.length === 0 && !dataLoading" class="status empty-state">
        No repos in database yet. Sync will happen automatically.
      </div>

      <div v-else class="results-container">
        <!-- Unified flat list of repos, PRs, and issues -->
        <ul v-if="visibleResults.length > 0" class="results-list">
          <li
            v-for="(item, index) in visibleResults"
            :key="item.id"
            :ref="(el) => setItemRef(item.id, el)"
            class="result-item"
            :class="{
              focused: isItemFocused(index),
              'type-repo': item.type === 'repo',
              'type-pr': item.type === 'pr',
              'type-issue': item.type === 'issue',
              'state-open': item.state === 'open',
              'state-merged': item.merged,
              'state-closed': item.state === 'closed' && !item.merged,
            }"
          >
            <!-- Skeleton result (placeholder while loading) -->
            <template v-if="item.type === 'skeleton'">
              <div class="result-icon">
                <div class="skeleton-icon-circle"></div>
              </div>
              <div class="result-content">
                <div class="skeleton-title-line">
                  <span class="skeleton-number"></span>
                  <span class="skeleton-title"></span>
                </div>
                <div class="result-meta">
                  <div class="skeleton-meta-line"></div>
                </div>
              </div>
            </template>

            <!-- Repo result -->
            <template v-else-if="item.type === 'repo'">
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
              <div class="result-content">
                <div class="result-title-row">
                  <a :href="item.url" class="result-title" @click="handleRepoClick">
                    {{ formatRepoName(item.title) }}
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
                <div class="result-meta repo-meta-split">
                  <span class="repo-meta-left">
                    <img
                      v-if="formatRepoMeta(item.entityId).leftAvatar"
                      :src="formatRepoMeta(item.entityId).leftAvatar"
                      :alt="formatRepoMeta(item.entityId).leftAvatarTitle || ''"
                      :title="formatRepoMeta(item.entityId).leftAvatarTitle || ''"
                      class="repo-meta-avatar"
                    />
                    {{ formatRepoMeta(item.entityId).left }}
                  </span>
                  <span v-if="formatRepoMeta(item.entityId).right" class="repo-meta-right">
                    <img
                      v-if="formatRepoMeta(item.entityId).rightAvatar"
                      :src="formatRepoMeta(item.entityId).rightAvatar"
                      alt="You"
                      class="repo-meta-avatar"
                    />
                    {{ formatRepoMeta(item.entityId).right }}
                  </span>
                </div>
              </div>
            </template>

            <!-- PR result -->
            <template v-else-if="item.type === 'pr'">
              <div class="result-icon">
                <!-- PR: Draft -->
                <svg
                  v-if="item.draft && item.state === 'open'"
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
              <div class="result-content" :class="{ 'compact-layout': !!repoFilter }">
                <a :href="item.url" class="result-title" @click="handleRepoClick">
                  <span class="result-number">#{{ item.number }}</span>
                  {{ item.title }}
                </a>
                <div class="result-meta">
                  <!-- Avatar display: creator or creator->assignee -->
                  <div v-if="item.user" class="avatar-container">
                    <!-- Show creator avatar -->
                    <img
                      :src="item.user.avatar_url"
                      :alt="item.user.login"
                      :title="`Opened by @${item.user.login}`"
                      class="user-avatar"
                    />
                    <!-- Show arrow and assignee avatar if assignee exists and differs from creator -->
                    <template v-if="item.assignee && item.assignee.login !== item.user.login">
                      <svg class="avatar-arrow" viewBox="0 0 16 16" width="12" height="12">
                        <path
                          fill="currentColor"
                          d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"
                        />
                      </svg>
                      <img
                        :src="item.assignee.avatar_url"
                        :alt="item.assignee.login"
                        :title="`Assigned to @${item.assignee.login}`"
                        class="user-avatar"
                      />
                    </template>
                  </div>
                  <span v-if="!repoFilter" class="repo-parent"
                    >in {{ formatRepoName(item.repoName) }}</span
                  >
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
              <div class="result-content" :class="{ 'compact-layout': !!repoFilter }">
                <a :href="item.url" class="result-title" @click="handleRepoClick">
                  <span class="result-number">#{{ item.number }}</span>
                  {{ item.title }}
                </a>
                <div class="result-meta">
                  <!-- Avatar display: creator or creator->assignee -->
                  <div v-if="item.user" class="avatar-container">
                    <!-- Show creator avatar -->
                    <img
                      :src="item.user.avatar_url"
                      :alt="item.user.login"
                      :title="`Opened by @${item.user.login}`"
                      class="user-avatar"
                    />
                    <!-- Show arrow and assignee avatar if assignee exists and differs from creator -->
                    <template v-if="item.assignee && item.assignee.login !== item.user.login">
                      <svg class="avatar-arrow" viewBox="0 0 16 16" width="12" height="12">
                        <path
                          fill="currentColor"
                          d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"
                        />
                      </svg>
                      <img
                        :src="item.assignee.avatar_url"
                        :alt="item.assignee.login"
                        :title="`Assigned to @${item.assignee.login}`"
                        class="user-avatar"
                      />
                    </template>
                  </div>
                  <span v-if="!repoFilter" class="repo-parent"
                    >in {{ formatRepoName(item.repoName) }}</span
                  >
                </div>
              </div>
            </template>
          </li>
        </ul>

        <!-- Load More Button -->
        <div v-if="hasMoreResults" class="load-more-container">
          <button class="load-more-btn" @click="showAllResults">
            Show all {{ filteredResults.length }} results
          </button>
        </div>

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
                  {{ formatRepoName(repo.full_name) }}
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
          v-if="searchQuery && visibleResults.length === 0 && filteredNonIndexedRepos.length === 0"
          class="status empty-state"
        >
          No results match "{{ searchQuery }}"
        </div>
      </div>

      <!-- (3) Status bar at bottom -->
      <div class="status-bar">
        <div class="status-indicator">
          <span class="status-dot" :class="syncStateClass" :title="syncStateTooltip"></span>
          <span class="status-text">
            {{ syncStateText }}
            <span v-if="syncCurrentRepo" class="syncing-repo">{{ syncCurrentRepo }}...</span>
          </span>
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
import { ref, computed, onMounted, nextTick, onUnmounted, watch, shallowRef } from 'vue';
import { useRepos } from '@/src/composables/useRepos';
import { useSyncStatus } from '@/src/composables/useSyncStatus';
import { useRateLimit } from '@/src/composables/useRateLimit';
import { useSyncPreferences } from '@/src/composables/useSyncPreferences';
import { useBackgroundMessage } from '@/src/composables/useBackgroundMessage';
import { useKeyboardShortcuts } from '@/src/composables/useKeyboardShortcuts';
import { useSearchCache } from '@/src/composables/useSearchCache';
import type { SearchResultItem } from '@/src/composables/useUnifiedSearch';
import { MessageType } from '@/src/messages/types';
import type { RepoRecord, IssueRecord, PullRequestRecord } from '@/src/types';
import { getCachedTheme, setCachedTheme, type ThemeMode } from '@/src/storage/chrome';
import { debugLog, debugLogSync, debugWarnSync } from '@/src/utils/debug';

const searchQuery = ref(''); // Immediate input value (updates on every keystroke)

const debouncedSearchQuery = ref(''); // Debounced value (used for filtering to prevent lag)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchInputRef = ref<any>(null);
const isDarkTheme = ref(false);

// Filter: Only show my contributions
const showOnlyMyContributions = ref(true); // Enabled by default

// Filter: Only show visited items
const showOnlyVisited = ref(false); // Disabled by default

// Cached contributors (loaded immediately for instant button display)
const cachedContributors = ref<string[]>([]);

// Computed: Get other contributors (top 2 besides current user)
const otherContributors = computed(() => {
  // Use cached contributors if available and no results loaded yet
  if (rawSearchResults.value.length === 0 && cachedContributors.value.length > 0) {
    return cachedContributors.value;
  }

  // Otherwise compute from loaded results
  if (!currentUsername.value) return [];

  const userCounts = new Map<string, number>();

  // Count contributions per user from all results
  rawSearchResults.value.forEach((item) => {
    if (item.type === 'pr' || item.type === 'issue') {
      const author = item.user?.login;
      if (author && author !== currentUsername.value) {
        userCounts.set(author, (userCounts.get(author) || 0) + 1);
      }
    }
  });

  // Sort by count and take top 2
  return Array.from(userCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([username]) => username);
});

// Computed: Should show filter button (only if there are other contributors)
const shouldShowFilterButton = computed(() => {
  return otherContributors.value.length > 0;
});

// Panel modes: NORMAL (unfocused list), FILTERED (focused search), or HIDDEN (closed)
type PanelMode = 'NORMAL' | 'FILTERED' | 'HIDDEN';
const panelMode = ref<PanelMode>('HIDDEN');

// Nested filtered mode state
const repoFilter = ref<RepoRecord | null>(null);
const previousSearchQuery = ref('');

// Cache for blazingly fast focused mode exit
interface FocusedModeCache {
  query: string;
  debouncedQuery: string;
  focusedIndex: number;
  rawSearchResults: SearchResultItem[];
}
const focusedModeCache = shallowRef<FocusedModeCache | null>(null);

// Flag to skip initial focus event (when we programmatically focus on open)
const skipNextFocusEvent = ref(false);

// Flag to skip fetchSearchResults when restoring from cache
const isRestoringFromCache = ref(false);

// Use debounced query for filtering to keep typing blazingly fast
const normalizedSearchQuery = computed(() => debouncedSearchQuery.value.trim().toLowerCase());

/**
 * Check if all repos share the same owner.
 * If so, we can strip the owner prefix from the display to save space.
 */
const commonOwnerPrefix = computed(() => {
  if (repos.value.length === 0) return '';
  const firstOwner = repos.value[0].owner.login;
  const allSame = repos.value.every((r) => r.owner.login === firstOwner);
  return allSame ? `${firstOwner}/` : '';
});

/**
 * Format repo name for display, stripping common prefix if applicable
 */
function formatRepoName(fullName: string | undefined): string {
  if (!fullName) return '';
  if (commonOwnerPrefix.value && fullName.startsWith(commonOwnerPrefix.value)) {
    return fullName.slice(commonOwnerPrefix.value.length);
  }
  return fullName;
}

// Track all PRs and issues by repo for unified search
const allPRsByRepo = ref<Record<number, PullRequestRecord[]>>({});
const allIssuesByRepo = ref<Record<number, IssueRecord[]>>({});
const dataLoading = ref(false);

const itemRefs = new Map<string, HTMLElement | null>();
const focusedIndex = ref(0);

/**
 * Ghost text logic
 */
const showGhostText = computed(() => {
  // Only show if:
  // 1. We have a search query
  // 2. We are NOT in nested filtered mode
  // 3. We have results
  // 4. The focused result is a repo
  if (!searchQuery.value || repoFilter.value || visibleResults.value.length === 0) {
    return false;
  }

  const focusedItem = visibleResults.value[focusedIndex.value];
  if (!focusedItem) return false;

  return focusedItem.type === 'repo';
});

const ghostTextSuffix = computed(() => {
  if (!showGhostText.value) return '';

  const focusedItem = visibleResults.value[focusedIndex.value];
  if (!focusedItem) return '';

  const repoName = formatRepoName(focusedItem.title);
  const query = searchQuery.value;

  // Case 1: Prefix match (standard ghost text)
  if (repoName.toLowerCase().startsWith(query.toLowerCase())) {
    // Return the suffix, preserving the repo's casing
    return repoName.slice(query.length);
  }

  // Case 2: Fuzzy match (show full name with separator)
  return ` — ${repoName}`;
});

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
const { loadFirstResult, loadContributors } = useSearchCache();

// Pass current username (reactive) for authorship-based sorting
const currentUsername = computed(() => syncStatus.value?.accountLogin || undefined);

// Store search results from background
const rawSearchResults = ref<SearchResultItem[]>([]);

/**
 * Fetch search results from background
 */
async function fetchSearchResults(query: string = '') {
  try {
    const messageType = preferences.value.debugMode ? MessageType.DEBUG_SEARCH : MessageType.SEARCH;
    const currentRepoName = getCurrentRepoFromUrl();

    const results = await sendMessage<SearchResultItem[]>(messageType, {
      query,
      currentUsername: currentUsername.value,
      currentRepoName,
    });

    // Log debug info if debug mode is enabled
    if (preferences.value.debugMode) {
      console.group('[CommandPalette] Search Results Debug');
      console.log('Query:', query || '(empty - showing all)');
      console.log('Total results:', results.length);
      console.table(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results.slice(0, 20).map((r: any) => ({
          type: r.type,
          title: r.title.substring(0, 50),
          lastVisited: r._debug?.lastVisitedAtFormatted || 'N/A',
          bucket: r._debug?.bucket || 'N/A',
          score: r._debug?.score || 0,
          isMine: r._debug?.isMine || false,
          state: r._debug?.state || 'N/A',
          merged: r._debug?.merged ?? 'N/A',
          draft: r._debug?.draft ?? 'N/A',
        })),
      );
      console.groupEnd();
    }

    rawSearchResults.value = results;

    // Update cache with what background returned (not what's displayed after swap)
    // Background already handles caching, so we don't need to do it here
    // The cache is automatically managed by the background script
  } catch (err) {
    console.error('[CommandPalette] Error fetching search results:', err);
    rawSearchResults.value = [];
  }
}

/**
 * Load all PRs and issues for indexed repos (now delegates to background)
 */
async function loadAllPRsAndIssues() {
  dataLoading.value = true;
  const startLoad = performance.now();

  // Fetch search results from background (empty query = all results)
  await fetchSearchResults(normalizedSearchQuery.value);

  const loadTime = performance.now() - startLoad;
  console.log(`[CommandPalette] Full results loaded in ${loadTime.toFixed(0)}ms`);

  // Build allIssuesByRepo and allPRsByRepo for backward compatibility
  // (used by repoCounts and other UI elements)
  const indexedReposList = indexedRepos.value;
  const prsByRepo: Record<number, PullRequestRecord[]> = {};
  const issuesByRepo: Record<number, IssueRecord[]> = {};

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
  let results = rawSearchResults.value;

  // Apply "Only My Contributions" filter
  if (showOnlyMyContributions.value) {
    results = results.filter((item) => {
      // Always show skeleton items (they're loading placeholders)
      if (item.type === 'skeleton') return true;

      // For repos: show if user has contributed or it's their repo
      if (item.type === 'repo') {
        return item.isMine || item.recentlyContributedByMe;
      }
      // For PRs/Issues: show if user created it or is involved
      return item.isMine || item.recentlyContributedByMe;
    });
  }

  // Apply "Only Visited" filter
  if (showOnlyVisited.value) {
    results = results.filter((item) => {
      // Always show skeleton items (they're loading placeholders)
      if (item.type === 'skeleton') return true;

      // Show only items that have been visited
      return item.lastVisitedAt != null;
    });
  }

  // If we have a repo filter, we only search within that repo
  if (repoFilter.value) {
    return results.filter((item) => {
      // Always show skeleton items
      if (item.type === 'skeleton') return true;

      // Filter by repoId for PRs/issues
      // But the user is searching *inside* the repo.
      // Let's exclude the repo item itself to avoid confusion, or maybe include it if it matches?
      // If I search "fix", I want issues/PRs.
      // Let's stick to contents.
      return item.repoId === repoFilter.value?.id;
    });
  }

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

const INITIAL_RESULT_LIMIT = 30;
const resultLimit = ref(INITIAL_RESULT_LIMIT);

const visibleResults = computed(() => {
  return filteredResults.value.slice(0, resultLimit.value);
});

const hasMoreResults = computed(() => {
  return filteredResults.value.length > visibleResults.value.length;
});

function showAllResults() {
  resultLimit.value = filteredResults.value.length;
}

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

  // Separate skeletons from real results
  const skeletons = results.filter((r) => r.type === 'skeleton');
  const realResults = results.filter((r) => r.type !== 'skeleton');

  const showingPrsOrIssues = preferences.value.syncIssues || preferences.value.syncPullRequests;

  // If not showing PRs/Issues, hide current repo completely
  if (!showingPrsOrIssues) {
    const processedResults = realResults.filter((item) => {
      if (item.type === 'repo') {
        return item.title !== currentRepoName;
      }
      return item.repoName !== currentRepoName;
    });
    return [...processedResults, ...skeletons];
  }

  // Swap 1st and 2nd if 1st is current repo
  if (realResults.length < 2) {
    return [...realResults, ...skeletons];
  }

  const first = realResults[0];
  const isFirstCurrentRepo =
    (first.type === 'repo' && first.title === currentRepoName) ||
    (first.type !== 'repo' && first.repoName === currentRepoName);

  if (!isFirstCurrentRepo) {
    return [...realResults, ...skeletons];
  }

  // Swap first and second
  const processedResults = [realResults[1], realResults[0], ...realResults.slice(2)];
  return [...processedResults, ...skeletons];
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
  const results = visibleResults.value;
  const item = results[focusedIndex.value];
  if (!item) return;
  const el = itemRefs.get(item.id);
  el?.scrollIntoView({ block: 'nearest' });
}

/**
 * Move focus to next item
 */
function moveNext() {
  const maxIndex = visibleResults.value.length - 1;
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
  const item = visibleResults.value[focusedIndex.value];
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

watch(debouncedSearchQuery, () => {
  // Skip if we're restoring from cache (results are already restored)
  if (isRestoringFromCache.value) {
    return;
  }

  resultLimit.value = INITIAL_RESULT_LIMIT;
  // Fetch new search results from background when query changes
  fetchSearchResults(normalizedSearchQuery.value);
});

watch(focusedIndex, () => {
  nextTick(() => ensureFocusVisible());
});

watch(visibleResults, () => {
  // Reset focus if current index is out of bounds
  if (focusedIndex.value >= visibleResults.value.length) {
    focusedIndex.value = Math.max(0, visibleResults.value.length - 1);
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
 * Enter focused mode for a repository (Right arrow or Tab)
 */
function enterFocusedMode() {
  // Guard: Must be on a repo
  const focusedItem = visibleResults.value[focusedIndex.value];
  if (!focusedItem || focusedItem.type !== 'repo') return;

  // Guard: Already in focused mode
  if (repoFilter.value) return;

  const repo = getRepoById(focusedItem.entityId);
  if (!repo) return;

  debugLogSync('[Git Look Around] Entering focused mode for:', repo.full_name);

  // Cache current state for instant restoration
  focusedModeCache.value = {
    query: searchQuery.value,
    debouncedQuery: debouncedSearchQuery.value,
    focusedIndex: focusedIndex.value,
    rawSearchResults: [...rawSearchResults.value],
  };

  // Clear any pending debounce to prevent delayed updates
  if (debounceTimeout) {
    window.clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }

  // Clear queries FIRST (before setting repoFilter) to prevent filtered results flash
  searchQuery.value = '';
  debouncedSearchQuery.value = '';

  // Clear raw results immediately to prevent showing stale filtered data
  rawSearchResults.value = [];

  // Enter focused mode (this will trigger results recomputation with empty query)
  repoFilter.value = repo;
  focusedIndex.value = 0;

  // Immediately fetch unfiltered results
  fetchSearchResults('');

  searchInputRef.value?.focus();
}

/**
 * Exit focused mode (Left arrow, Escape, or Backspace)
 */
function exitFocusedMode() {
  if (!repoFilter.value) return;

  debugLogSync('[Git Look Around] Exiting focused mode');

  // Clear focused mode
  repoFilter.value = null;

  // Restore from cache (blazingly fast!)
  if (focusedModeCache.value) {
    const cache = focusedModeCache.value;

    // Clear any pending debounce to prevent delayed re-render
    if (debounceTimeout) {
      window.clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    // Set flag to prevent watcher from triggering fetchSearchResults
    isRestoringFromCache.value = true;

    // Restore raw search results FIRST (before queries) to prevent refetch
    rawSearchResults.value = cache.rawSearchResults;

    // Restore both query values synchronously to avoid triggering debounce watcher
    searchQuery.value = cache.query;
    debouncedSearchQuery.value = cache.debouncedQuery;

    // Clear flag after restoration is complete
    nextTick(() => {
      isRestoringFromCache.value = false;
      focusedIndex.value = cache.focusedIndex;
      ensureFocusVisible();
    });
  }

  // Clear cache
  focusedModeCache.value = null;

  // Restore panel mode if we had a query
  if (searchQuery.value.trim()) {
    panelMode.value = 'FILTERED';
  }

  searchInputRef.value?.focus();
}

function handleTab() {
  enterFocusedMode();
}

function handleBackspace(e: KeyboardEvent) {
  // If in focused mode and query is empty, exit focused mode on Backspace
  if (repoFilter.value && searchQuery.value === '') {
    e.preventDefault(); // Prevent deleting from restored query
    exitFocusedMode();
  }
}

/**
 * Handle text input - trigger FILTERED mode when user starts typing
 */
function handleSearchInput() {
  if (searchQuery.value.trim() && panelMode.value === 'NORMAL') {
    debugWarnSync('[Git Look Around] User typed, entering FILTERED mode');
    panelMode.value = 'FILTERED';
  } else if (!searchQuery.value.trim() && panelMode.value === 'FILTERED') {
    debugWarnSync('[Git Look Around] Search cleared, returning to NORMAL mode');
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
 * Current repo being synced (for display)
 */
const syncCurrentRepo = computed(() => {
  if (!syncStatus.value?.isRunning) return null;
  return syncStatus.value.progress.currentRepo;
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
async function enterFilteredMode() {
  await debugLog('[Git Look Around] State: enterFilteredMode', {
    currentMode: panelMode.value,
    skipNextFocusEvent: skipNextFocusEvent.value,
  });
  if (skipNextFocusEvent.value) {
    skipNextFocusEvent.value = false;
    await debugLog('[Git Look Around] Skipping initial focus event');
    return;
  }
  if (panelMode.value === 'NORMAL') {
    panelMode.value = 'FILTERED';
    await debugLog('[Git Look Around] State Change: NORMAL -> FILTERED');
  }
}

function handleInputBlur() {
  // Input blur is handled by other mechanisms (backdrop click, ESC key)
  // We intentionally do nothing here to keep the panel state stable
}

async function exitFilteredModeAndClear() {
  await debugLog('[Git Look Around] State: exitFilteredModeAndClear', {
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
  resultLimit.value = INITIAL_RESULT_LIMIT;
  repoFilter.value = null;
  previousSearchQuery.value = '';

  // CRITICAL FIX: We must set panelMode to NORMAL *before* refocusing
  panelMode.value = 'NORMAL';

  // Force focus back to input in case it was lost
  nextTick(() => {
    // Set flag to skip the next focus event so we don't re-enter FILTERED mode
    skipNextFocusEvent.value = true;
    searchInputRef.value?.focus();
  });

  await debugLog('[Git Look Around] State Change: FILTERED -> NORMAL (cleared)', {
    afterSearchQuery: searchQuery.value,
    panelMode: panelMode.value,
  });
}

/**
 * Create skeleton placeholder items for smooth loading UX
 * These fill the screen while real results are loading
 */
function createSkeletonItems(count: number): SearchResultItem[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'skeleton' as const,
    id: `skeleton-${i}`,
    entityId: -i - 1,
    title: '',
    url: '',
    score: 0,
  }));
}

async function show() {
  await debugLog('[Git Look Around] State: show');

  // Clear any pending debounce
  if (debounceTimeout) {
    window.clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }

  searchQuery.value = '';
  debouncedSearchQuery.value = '';
  focusedIndex.value = 0;
  resultLimit.value = INITIAL_RESULT_LIMIT;
  panelMode.value = 'NORMAL';
  repoFilter.value = null;
  sendMessage(MessageType.SET_QUICK_CHECK_BROWSING);

  // INSTANT DISPLAY: Load cached first result immediately for zero-delay UX
  const cachedFirstResult = await loadFirstResult();

  // Always show skeletons to prevent "Not indexed" section from jumping
  const skeletons = createSkeletonItems(15);

  if (cachedFirstResult) {
    rawSearchResults.value = [cachedFirstResult, ...skeletons];
    console.log('[CommandPalette] ⚡ Instant display: cached first result + 15 skeletons');
  } else {
    rawSearchResults.value = skeletons;
    console.log('[CommandPalette] ⚡ Instant display: 15 skeletons (no cached result yet)');
  }

  // Load cached contributors for instant button display
  const contributors = await loadContributors();
  if (contributors.length > 0) {
    cachedContributors.value = contributors;
    console.log('[CommandPalette] ⚡ Loaded cached contributors:', contributors.length);
  }

  // Load repos and all PRs/issues (this will fetch full results and replace the cached one)
  await loadReposData();
  await loadAllPRsAndIssues();

  await nextTick();
  skipNextFocusEvent.value = true;
  searchInputRef.value?.focus();
  await debugLog('[Git Look Around] Palette shown, input focused, panelMode =', panelMode.value);
}

async function hide() {
  await debugLog('[Git Look Around] State: hide');
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
 * Handle cache update from background script
 * Only update UI if palette is currently open and showing results
 */
function handleCacheUpdate(results: SearchResultItem[]) {
  // Only update if palette is open
  if (panelMode.value === 'HIDDEN') return;

  console.log('[CommandPalette] Received cache update with', results.length, 'results');
  rawSearchResults.value = results;
}

/**
 * Toggle "Only My Contributions" filter
 */
function toggleMyContributionsFilter() {
  showOnlyMyContributions.value = !showOnlyMyContributions.value;
  // Save to local storage
  browser.storage.local.set({ showOnlyMyContributions: showOnlyMyContributions.value });
  console.log('[CommandPalette] My contributions filter:', showOnlyMyContributions.value);
}

/**
 * Toggle "Only Visited" filter
 */
function toggleVisitedFilter() {
  showOnlyVisited.value = !showOnlyVisited.value;
  // Save to local storage
  browser.storage.local.set({ showOnlyVisited: showOnlyVisited.value });
  console.log('[CommandPalette] Visited filter:', showOnlyVisited.value);
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
 * Format repo metadata line (last pushed + personal activity)
 */
function formatRepoMeta(repoId: number): {
  left: string;
  leftAvatar?: string;
  leftAvatarTitle?: string;
  right: string;
  rightAvatar?: string;
} {
  const repo = getRepoById(repoId);
  if (!repo) return { left: '—', right: '' };

  let left = '';
  let leftAvatar: string | undefined;
  let leftAvatarTitle: string | undefined;
  let right = '';
  let rightAvatar: string | undefined;

  // Left side: Last pushed (repo-wide activity) - no avatar since we don't have pusher info
  if (repo.pushed_at) {
    const pushedAt = new Date(repo.pushed_at).getTime();
    left = `Pushed ${formatTimeAgo(pushedAt)}`;
  }

  // Right side: Personal activity with your avatar
  const personalParts: string[] = [];

  // Your last contribution (if you're a contributor)
  if (repo.me_contributing && repo.last_contributed_at) {
    const contributedAt = new Date(repo.last_contributed_at).getTime();
    personalParts.push(`Pushed ${formatTimeAgo(contributedAt)}`);
  }

  // Your last visit
  if (repo.last_visited_at) {
    personalParts.push(`Visited ${formatTimeAgo(repo.last_visited_at)}`);
  }

  if (personalParts.length > 0) {
    right = personalParts.join(' · ');
    if (syncStatus.value?.accountLogin) {
      rightAvatar = `https://github.com/${syncStatus.value.accountLogin}.png?size=32`;
    }
  }

  return { left: left || '—', leftAvatar, leftAvatarTitle, right, rightAvatar };
}

/**
 * Format time ago (e.g., "7m ago", "2h ago", "3d ago")
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const months = Math.floor(diff / (30 * 24 * 60 * 60 * 1000));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return `${months}mo ago`;
}

/**
 * Detect dark theme preference from DOM
 * Checks GitHub's theme setting
 */
function detectDarkTheme(): boolean {
  // Method 1: Check GitHub's theme (most accurate for GitHub pages)
  const htmlElement = document.documentElement;
  const githubTheme = htmlElement.getAttribute('data-color-mode');

  // GitHub uses: 'light', 'dark', or 'auto'
  if (githubTheme === 'dark') {
    return true;
  }

  if (githubTheme === 'light') {
    return false;
  }

  // If 'auto' or not set, check OS-level preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }

  // Method 2: Fallback - check if GitHub has dark class
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

  // Load filter preferences from storage
  const filterPrefs = await browser.storage.local.get([
    'showOnlyMyContributions',
    'showOnlyVisited',
  ]);
  if (filterPrefs.showOnlyMyContributions !== undefined) {
    showOnlyMyContributions.value = filterPrefs.showOnlyMyContributions;
  }
  if (filterPrefs.showOnlyVisited !== undefined) {
    showOnlyVisited.value = filterPrefs.showOnlyVisited;
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
      await debugLog('[CommandPalette] Sync completed, reloading PRs and issues...');
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
    select: (newTab) => navigateToFocusedTarget(newTab),
    tab: () => handleTab(),
    dismiss: async () => {
      await debugLog('[Git Look Around] Action: dismiss', { panelMode: panelMode.value });

      // If in nested mode, exit nested mode first
      if (repoFilter.value) {
        await debugLog('[Git Look Around] Exiting nested filtered mode via Escape');
        exitFocusedMode();
        return;
      }

      if (panelMode.value === 'FILTERED') {
        await exitFilteredModeAndClear();
        await debugLog('[Git Look Around] After exitFilteredModeAndClear:', {
          searchQuery: searchQuery.value,
          panelMode: panelMode.value,
        });
        searchInputRef.value?.blur();
      } else {
        await hide();
      }
    },
    focusInput: () => searchInputRef.value?.focus(),
    onType: (char) => {
      searchInputRef.value?.focus();
      nextTick(() => {
        searchQuery.value += char;
      });
    },
    enterFocusedMode: () => enterFocusedMode(),
    exitFocusedMode: () => exitFocusedMode(),
  },
  () => panelMode.value !== 'HIDDEN',
);

// Expose methods so parent can call them
defineExpose({
  show,
  hide,
  toggle,
  handleCacheUpdate,
});
</script>

<style scoped>
.git-look-around-overlay {
  /* GitHub color variables - Light theme */
  --fgColor-accent: #0969da;
  --bgColor-accent-muted: #ddf4ff;
  --borderColor-accent-emphasis: #0969da;
  --borderColor-default: #d0d7de;
  --fgColor-default: #24292f;
  --fgColor-muted: #57606a;
  --bgColor-muted: #f6f8fa;

  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 999999;
  padding-top: 10vh;
}

.git-look-around-popup {
  background: var(--bgColor-muted);
  border: 1px solid var(--borderColor-default);
  border-radius: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 675px;
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
  border-bottom: 1px solid var(--borderColor-default);
  background: white;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  min-height: 48px; /* Fixed height to prevent jumping */
}

.search-icon {
  flex-shrink: 0;
  fill: var(--fgColor-muted);
}

.spinner-icon {
  flex-shrink: 0;
  fill: var(--fgColor-muted);
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
  color: var(--fgColor-default);
  line-height: 20px;
}

.search-input::placeholder {
  color: var(--fgColor-muted);
}

/* Filter button */
.filter-button {
  flex-shrink: 0;
  height: 24px; /* Match search input line height */
  padding: 2px 8px;
  border: 1px solid var(--borderColor-default);
  border-radius: 4px;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: all 0.15s ease;
  font-size: 11px;
  font-weight: 500;
  color: var(--fgColor-muted);
}

.filter-button:hover {
  background: var(--bgColor-muted);
  border-color: var(--borderColor-accent-emphasis);
  color: var(--fgColor-accent);
}

.filter-button.active {
  background: var(--bgColor-accent-muted);
  border-color: var(--borderColor-accent-emphasis);
  color: var(--fgColor-accent);
}

.filter-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid white;
}

.avatar-stack {
  position: relative;
  display: flex;
  align-items: center;
  height: 16px;
  width: 36px; /* Wider to accommodate more spacing */
}

.stack-avatar {
  position: absolute;
  left: 0;
  transition: transform 0.2s ease;
}

.filter-label {
  white-space: nowrap;
  line-height: 1;
}

.filter-button svg {
  width: 16px;
  height: 16px;
  fill: var(--fgColor-muted);
  flex-shrink: 0;
}

.filter-button.active svg {
  fill: var(--fgColor-accent);
}

.filter-button:hover svg {
  fill: var(--fgColor-accent);
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
  padding: 7px 16px 8px 16px;
  border-bottom: 1px solid var(--borderColor-default);
  cursor: pointer;
  transition: background-color 0.1s;
}

/* Skeleton items for loading state */
.result-item.type-skeleton {
  cursor: default;
  pointer-events: none;
  opacity: 0.5;
}

.skeleton-icon-circle {
  width: 16px;
  height: 16px;
  background: var(--borderColor-default);
  border-radius: 50%; /* Circle for PR/issue icon */
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}

.skeleton-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
}

.skeleton-number {
  height: 14px;
  width: 32px; /* Width for "#1234" */
  background: var(--borderColor-default);
  border-radius: 3px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}

.skeleton-title {
  height: 14px;
  background: var(--borderColor-default);
  border-radius: 3px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  flex: 1;
  max-width: 400px;
}

.skeleton-meta-line {
  height: 12px;
  width: 120px; /* Width for "in owner/repo" text */
  background: var(--borderColor-default);
  border-radius: 3px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

/* Vary skeleton widths for more natural loading appearance */
.result-item.type-skeleton:nth-child(2) .skeleton-title {
  max-width: 280px;
}

.result-item.type-skeleton:nth-child(3) .skeleton-title {
  max-width: 380px;
}

.result-item.type-skeleton:nth-child(4) .skeleton-title {
  max-width: 320px;
}

.result-item.type-skeleton:nth-child(5) .skeleton-title {
  max-width: 360px;
}

.result-item.type-skeleton:nth-child(6) .skeleton-title {
  max-width: 300px;
}

.result-item.type-skeleton:nth-child(7) .skeleton-title {
  max-width: 400px;
}

.result-item.type-skeleton:nth-child(8) .skeleton-title {
  max-width: 340px;
}

.result-item.type-skeleton:nth-child(9) .skeleton-title {
  max-width: 310px;
}

.result-item.type-skeleton:nth-child(10) .skeleton-title {
  max-width: 370px;
}

.result-item.type-skeleton:nth-child(11) .skeleton-title {
  max-width: 290px;
}

.result-item.type-skeleton:nth-child(12) .skeleton-title {
  max-width: 350px;
}

.result-item.type-skeleton:nth-child(13) .skeleton-title {
  max-width: 330px;
}

.result-item.type-skeleton:nth-child(14) .skeleton-title {
  max-width: 390px;
}

.result-item.type-skeleton:nth-child(15) .skeleton-title {
  max-width: 310px;
}

.result-item.type-skeleton:nth-child(16) .skeleton-title {
  max-width: 360px;
}

/* Vary meta line widths too */
.result-item.type-skeleton:nth-child(even) .skeleton-meta-line {
  width: 140px;
}

.result-item.type-skeleton:nth-child(3n) .skeleton-meta-line {
  width: 160px;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.result-item:last-child {
  border-bottom: none;
}

.result-item.focused {
  background: var(--bgColor-accent-muted);
  border-left: 3px solid var(--borderColor-accent-emphasis);
  padding-left: 13px;
}

.result-item.state-closed {
  opacity: 0.7;
}

.result-item.state-merged {
  opacity: 1; /* Merged PRs should be fully visible */
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
  color: var(--fgColor-muted);
}

.icon-pr.icon-open {
  color: #1a7f37;
}

.icon-pr.icon-draft {
  color: var(--fgColor-muted);
}

.icon-pr.icon-merged {
  color: #8250df;
}

.icon-pr.icon-closed {
  color: #d1242f;
}

.icon-issue.icon-open {
  color: var(--fgColor-accent);
}

.icon-issue.icon-closed {
  color: #8b949e;
}

.result-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.result-content.compact-layout {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.result-content.compact-layout .result-title {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
}

.result-content.compact-layout .result-meta {
  flex-shrink: 0;
}

.result-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--fgColor-default);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  line-height: 22px;
}

.result-title-row .result-title {
  flex: 1;
  min-width: 0;
}

.result-title:hover {
  color: var(--fgColor-accent);
  text-decoration: none;
}

.result-number {
  color: var(--fgColor-muted);
  font-weight: 600;
  font-size: 13px;
  margin-right: 6px;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--fgColor-muted);
  height: 22px;
  line-height: 22px;
}

.user-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.avatar-container {
  display: flex;
  align-items: center;
  gap: 4px;
}

.avatar-arrow {
  flex-shrink: 0;
  color: var(--fgColor-muted);
  opacity: 0.6;
}

.repo-parent {
  color: var(--fgColor-muted);
  font-size: 12px;
}

.repo-meta-split {
  justify-content: space-between;
}

.repo-meta-left,
.repo-meta-right {
  color: var(--fgColor-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.repo-meta-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.repo-meta-right {
  opacity: 0.8;
}

.repo-counts-inline {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
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
}

.count-badge-inline .icon {
  fill: currentColor;
  flex-shrink: 0;
}

.count-badge-inline.prs {
  color: #1a7f37;
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
  background: var(--bgColor-muted);
  border: 1px solid var(--borderColor-default);
}

.count-badge .icon {
  fill: currentColor;
  flex-shrink: 0;
}

.count-badge.issues {
  color: var(--fgColor-accent);
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
  background: var(--bgColor-muted);
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
  color: var(--fgColor-accent);
  transition:
    background-color 0.2s,
    border-color 0.2s;
  flex-shrink: 0;
  margin-left: auto;
}

.add-to-index-btn:hover {
  background: var(--bgColor-muted);
  border-color: var(--borderColor-accent-emphasis);
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

.syncing-repo {
  font-style: italic;
  opacity: 0.8;
  margin-left: 4px;
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
.git-look-around-popup.dark-theme {
  /* GitHub color variables - Dark theme */
  --fgColor-accent: #1f6feb;
  --bgColor-accent-muted: #388bfd1a;
  --borderColor-accent-emphasis: #1f6feb;
  --borderColor-default: #444c56;
  --fgColor-default: #e6edf3;
  --fgColor-muted: #768390;
  --bgColor-muted: #1c2128;
  --bgColor-emphasis: #2d333b;
  --bgColor-neutral-muted: #22272e;

  background: var(--bgColor-muted);
  border-color: var(--borderColor-default);
  color: var(--fgColor-default);
}

.dark-theme .search-bar {
  background: var(--bgColor-muted);
  border-bottom-color: var(--borderColor-default);
}

.dark-theme .search-icon,
.dark-theme .spinner-icon {
  fill: var(--fgColor-muted);
}

.dark-theme .search-input {
  background: transparent;
  color: var(--fgColor-default);
}

.dark-theme .search-input::placeholder {
  color: var(--fgColor-muted);
}

.dark-theme .filter-button {
  background: var(--bgColor-muted);
  border-color: var(--borderColor-default);
  color: var(--fgColor-muted);
}

.dark-theme .filter-button:hover {
  background: var(--bgColor-emphasis);
  border-color: var(--borderColor-accent-emphasis);
  color: var(--fgColor-accent);
}

.dark-theme .filter-button.active {
  background: var(--bgColor-accent-muted);
  border-color: var(--borderColor-accent-emphasis);
  color: var(--fgColor-accent);
}

.dark-theme .filter-button svg {
  fill: var(--fgColor-muted);
}

.dark-theme .filter-button.active svg {
  fill: var(--fgColor-accent);
}

.dark-theme .filter-button:hover svg {
  fill: var(--fgColor-accent);
}

.dark-theme .filter-avatar {
  border-color: var(--bgColor-muted);
}

.dark-theme .avatar-arrow {
  color: var(--fgColor-muted);
}

.dark-theme .status {
  color: var(--fgColor-muted);
}

.dark-theme .status.error {
  color: #f85149;
}

/* Dark theme skeleton styles */
.dark-theme .skeleton-icon-circle,
.dark-theme .skeleton-number,
.dark-theme .skeleton-title,
.dark-theme .skeleton-meta-line {
  background: #373e47;
}

.dark-theme .result-item {
  border-bottom-color: #373e47;
}

.dark-theme .result-item.focused {
  background: var(--bgColor-accent-muted);
  border-left-color: var(--borderColor-accent-emphasis);
}

.dark-theme .result-title {
  color: var(--fgColor-default);
}

.dark-theme .result-title:hover {
  color: var(--fgColor-accent);
}

.dark-theme .result-number,
.dark-theme .result-meta,
.dark-theme .repo-parent,
.dark-theme .repo-meta-left,
.dark-theme .repo-meta-right {
  color: var(--fgColor-muted);
}

.dark-theme .icon-private {
  color: #d29922;
}

.dark-theme .icon-fork,
.dark-theme .icon-public {
  color: var(--fgColor-muted);
}

.dark-theme .icon-pr.icon-open {
  color: #56d364;
}

.dark-theme .icon-pr.icon-draft {
  color: var(--fgColor-muted);
}

.dark-theme .icon-pr.icon-merged {
  color: #a371f7;
}

.dark-theme .icon-pr.icon-closed {
  color: #f85149;
}

.dark-theme .icon-issue.icon-open {
  color: var(--fgColor-accent);
}

.dark-theme .icon-issue.icon-closed {
  color: var(--fgColor-muted);
}

.dark-theme .count-badge {
  background: var(--bgColor-neutral-muted);
  border-color: var(--borderColor-default);
}

.dark-theme .count-badge.issues {
  color: var(--fgColor-accent);
}

.dark-theme .count-badge.prs {
  color: #56d364;
}

.dark-theme .count-badge-inline.prs {
  color: #56d364;
}

.dark-theme .non-indexed-separator {
  background: var(--bgColor-neutral-muted);
  border-top-color: var(--borderColor-default);
  border-bottom-color: var(--borderColor-default);
  color: var(--fgColor-muted);
}

.dark-theme .result-item.non-indexed .result-title {
  color: var(--fgColor-muted);
}

.dark-theme .add-to-index-btn {
  border-color: var(--borderColor-default);
  color: var(--fgColor-accent);
}

.dark-theme .add-to-index-btn:hover {
  background: var(--bgColor-neutral-muted);
  border-color: var(--borderColor-accent-emphasis);
}

.dark-theme .status-bar {
  background: var(--bgColor-neutral-muted);
  border-top-color: var(--borderColor-default);
}

.dark-theme .status-text {
  color: var(--fgColor-muted);
}

.load-more-container {
  padding: 12px;
  display: flex;
  justify-content: center;
  border-bottom: 1px solid var(--borderColor-default);
}

.load-more-btn {
  background: var(--bgColor-muted);
  border: 1px solid var(--borderColor-default);
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fgColor-default);
  cursor: pointer;
  transition: background-color 0.2s;
}

.load-more-btn:hover {
  background: #f3f4f6;
  border-color: #8b949e;
}

.dark-theme .load-more-container {
  border-bottom-color: #373e47;
}

.dark-theme .load-more-btn {
  background: #22272e;
  border-color: #444c56;
  color: #adbac7;
}

.dark-theme .load-more-btn:hover {
  background: #30363d;
  border-color: #8b949e;
}

.repo-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--fgColor-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.hint-key {
  border: 1px solid var(--borderColor-default);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 11px;
  background: var(--bgColor-muted);
  color: var(--fgColor-muted);
}

.dark-theme .hint-key {
  border-color: #444c56;
  background: #22272e;
  color: #adbac7;
}

.repo-filter-prefix {
  font-size: 14px;
  color: var(--fgColor-muted);
  margin-left: 4px;
  white-space: nowrap;
}

.dark-theme .repo-filter-prefix {
  color: #768390;
}

.repo-filter-slash {
  color: var(--fgColor-muted);
}

.input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.ghost-text-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  display: flex;
  align-items: center;
  padding: 0;
  font-size: 14px;
  font-family: inherit;
  white-space: pre;
  overflow: hidden;
  line-height: 20px;
}

.ghost-text-invisible {
  color: transparent;
}

.ghost-text-visible {
  color: #8c959f;
}

.dark-theme .ghost-text-visible {
  color: #6e7681;
}
</style>
