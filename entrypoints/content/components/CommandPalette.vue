<template>
  <div v-if="isVisible" class="gitjump-overlay" @click="handleBackdropClick">
    <div class="gitjump-popup">
      <h2>Your Repositories</h2>

      <div v-if="loading" class="status">Loading repos...</div>
      <div v-else-if="error" class="status error">{{ error }}</div>
      <div v-else-if="repos.length === 0" class="status">No repos found</div>

      <ul v-else class="repos-list">
        <li v-for="repo in repos" :key="repo.id" class="repo-item">
          <a :href="repo.html_url" target="_blank" class="repo-link">
            {{ repo.full_name }}
          </a>
          <span v-if="repo.description" class="repo-desc">{{ repo.description }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { getUserRepos, type GitHubRepo } from '@/shared/github-api';
import { getReposCache, saveReposCache, isCacheValid } from '@/shared/storage';

const isVisible = ref(false);
const repos = ref<GitHubRepo[]>([]);
const loading = ref(false);
const error = ref('');
const isRefreshing = ref(false);

async function show() {
  isVisible.value = true;
  await fetchRepos();
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

async function fetchRepos() {
  error.value = '';

  // Try to load from cache first
  const cachedRepos = await getReposCache();
  const cacheIsValid = await isCacheValid();

  if (cachedRepos && cacheIsValid) {
    // Use cached data immediately
    repos.value = cachedRepos;
    // Optionally refresh in background without blocking
    refreshInBackground();
  } else {
    // No valid cache, load from API
    loading.value = true;
    await loadFromAPI();
  }
}

async function loadFromAPI() {
  try {
    const freshRepos = await getUserRepos(10);
    repos.value = freshRepos;
    await saveReposCache(freshRepos);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch repos';
    console.error('Failed to fetch repos:', e);
  } finally {
    loading.value = false;
  }
}

async function refreshInBackground() {
  isRefreshing.value = true;
  try {
    const freshRepos = await getUserRepos(10);
    repos.value = freshRepos;
    await saveReposCache(freshRepos);
  } catch (e) {
    console.error('Failed to refresh repos in background:', e);
  } finally {
    isRefreshing.value = false;
  }
}

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

.gitjump-popup h2 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
}

.status {
  padding: 20px;
  text-align: center;
  color: #586069;
}

.status.error {
  color: #d73a49;
}

.repos-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.repo-item {
  padding: 12px;
  border-bottom: 1px solid #e1e4e8;
}

.repo-item:last-child {
  border-bottom: none;
}

.repo-item:hover {
  background: #f6f8fa;
}

.repo-link {
  font-weight: 600;
  color: #0366d6;
  text-decoration: none;
  display: block;
  margin-bottom: 4px;
}

.repo-link:hover {
  text-decoration: underline;
}

.repo-desc {
  font-size: 14px;
  color: #586069;
  display: block;
}
</style>
