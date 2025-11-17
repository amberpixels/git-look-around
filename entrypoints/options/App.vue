<template>
  <div class="options-container">
    <h1>Gitjump Settings</h1>

    <div class="section">
      <h2>GitHub Authentication</h2>

      <div v-if="!isAuthenticated" class="auth-form">
        <p class="instructions">To use Gitjump, you need a GitHub Personal Access Token.</p>

        <ol class="steps">
          <li>
            Go to
            <a href="https://github.com/settings/tokens/new" target="_blank"
              >GitHub Token Settings</a
            >
          </li>
          <li>Click "Generate new token (classic)"</li>
          <li>Give it a name (e.g., "Gitjump")</li>
          <li>Select scopes: <code>repo</code>, <code>read:user</code>, <code>read:org</code></li>
          <li>Click "Generate token"</li>
          <li>Copy and paste the token below:</li>
        </ol>

        <input
          v-model="tokenInput"
          type="password"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          class="token-input"
          @keyup.enter="saveToken"
        />

        <button class="btn-primary" :disabled="!tokenInput" @click="saveToken">Save Token</button>

        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <div v-else class="auth-status">
        <p class="success">✓ Authenticated with GitHub</p>
        <button class="btn-secondary" @click="logout">Logout</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { saveGitHubToken, getGitHubToken, removeGitHubToken } from '@/src/storage/chrome';

const tokenInput = ref('');
const isAuthenticated = ref(false);
const error = ref('');

onMounted(async () => {
  const token = await getGitHubToken();
  isAuthenticated.value = !!token;
});

async function saveToken() {
  if (!tokenInput.value.trim()) {
    error.value = 'Please enter a token';
    return;
  }

  try {
    await saveGitHubToken(tokenInput.value.trim());
    isAuthenticated.value = true;
    tokenInput.value = '';
    error.value = '';
  } catch (e) {
    error.value = 'Failed to save token';
    console.error(e);
  }
}

async function logout() {
  await removeGitHubToken();
  isAuthenticated.value = false;
}
</script>

<style scoped>
.options-container {
  max-width: 800px;
  margin: 40px auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  font-size: 32px;
  margin-bottom: 30px;
}

h2 {
  font-size: 20px;
  margin-bottom: 15px;
}

.section {
  background: #f6f8fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.instructions {
  margin-bottom: 15px;
  color: #586069;
}

.steps {
  margin: 15px 0;
  padding-left: 20px;
}

.steps li {
  margin-bottom: 8px;
}

.steps code {
  background: #e1e4e8;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 14px;
}

.steps a {
  color: #0366d6;
  text-decoration: none;
}

.steps a:hover {
  text-decoration: underline;
}

.token-input {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  border: 1px solid #d1d5da;
  border-radius: 6px;
  margin: 15px 0;
  font-family: monospace;
}

.token-input:focus {
  outline: none;
  border-color: #0366d6;
  box-shadow: 0 0 0 3px rgba(3, 102, 214, 0.1);
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  font-size: 14px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary {
  background: #2ea44f;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2c974b;
}

.btn-primary:disabled {
  background: #94d3a2;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.success {
  color: #2ea44f;
  font-weight: 600;
  margin-bottom: 15px;
}

.error {
  color: #d73a49;
  margin-top: 10px;
}

.auth-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
</style>
