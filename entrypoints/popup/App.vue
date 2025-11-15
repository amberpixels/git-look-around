<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { validateToken } from '@/shared/github-api';

const isAuthenticated = ref<boolean | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    isAuthenticated.value = await validateToken();
  } catch {
    isAuthenticated.value = false;
  } finally {
    loading.value = false;
  }
});

function openOptions() {
  browser.runtime.openOptionsPage();
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
</style>
