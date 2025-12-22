<template>
  <div class="options-container">
    <h1>Git Look Around Settings</h1>

    <div class="section">
      <h2>GitHub Authentication</h2>
      <p class="instructions">
        Personal Access Token
        <span class="help-link-wrapper">
          <a
            href="https://github.com/settings/tokens/new"
            target="_blank"
            class="help-link"
            @click.prevent="showTooltip = !showTooltip"
            >(create new)</a
          >
          <div v-if="showTooltip" class="tooltip">
            <button class="tooltip-close" @click="showTooltip = false">×</button>
            <h4>How to create a GitHub token:</h4>
            <ol>
              <li>
                <a
                  href="https://github.com/settings/tokens/new"
                  target="_blank"
                  @click="showTooltip = false"
                  >Click here to open GitHub Token Settings</a
                >
              </li>
              <li>Click "Generate new token (classic)"</li>
              <li>Give it a name (e.g., "Git Look Around")</li>
              <li>
                Select scopes: <code>repo</code>, <code>read:user</code>, <code>read:org</code>
              </li>
              <li>Click "Generate token" and paste it above</li>
            </ol>
          </div>
        </span>
      </p>

      <div class="token-form">
        <div class="token-input-group">
          <input
            v-model="tokenInput"
            type="text"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            class="token-input"
            @keyup.enter="saveToken"
            @focus="handleTokenFocus"
          />
          <span v-if="isAuthenticated" class="token-status success" title="Token is valid">✓</span>
          <span v-else-if="error" class="token-status error" title="Token is invalid">✗</span>
        </div>

        <div class="token-actions">
          <button class="btn-primary" :disabled="!tokenInput" @click="saveToken">
            {{ isAuthenticated ? 'Update' : 'Save' }} Token
          </button>
          <button v-if="isAuthenticated" class="btn-secondary" @click="logout">Clear</button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="tokenSaved" class="success small">✓ Token saved successfully</p>
      </div>
    </div>

    <div v-if="isAuthenticated" class="section">
      <h2>Sync (Import) Preferences</h2>
      <p class="instructions">
        Choose what data to sync from GitHub (repositories are always synced).
      </p>

      <div class="preferences">
        <label class="checkbox-label">
          <input
            v-model="preferences.importIssues"
            type="checkbox"
            class="checkbox"
            @change="savePreferences"
          />
          <span>Sync Issues</span>
        </label>

        <label class="checkbox-label">
          <input
            v-model="preferences.importPullRequests"
            type="checkbox"
            class="checkbox"
            @change="savePreferences"
          />
          <span>Sync Pull Requests</span>
        </label>
      </div>

      <p v-if="preferencesSaved" class="success small">✓ Preferences saved</p>
    </div>

    <div
      v-if="
        isAuthenticated &&
        (availableOrgs.ownOrgs.length > 0 || availableOrgs.externalOrgs.length > 0)
      "
      class="section"
    >
      <h2>Organization Filters</h2>
      <p class="instructions">
        Choose which organizations to include in search results. Unchecked organizations will be
        excluded.
      </p>

      <div class="org-columns">
        <!-- Own Organizations -->
        <div v-if="availableOrgs.ownOrgs.length > 0" class="org-column">
          <div class="org-category-header">
            <label class="checkbox-label category-checkbox">
              <input
                :checked="allOwnOrgsSelected"
                type="checkbox"
                class="checkbox"
                @change="toggleAllOwnOrgs"
              />
              <h3 class="org-category-title">My Organizations</h3>
            </label>
          </div>
          <div class="org-list">
            <label v-for="org in availableOrgs.ownOrgs" :key="org" class="checkbox-label">
              <input
                v-model="orgFilterPreferences.enabledOrgs[org]"
                type="checkbox"
                class="checkbox"
                @change="saveOrgFilters"
              />
              <span>{{ org }}</span>
            </label>
          </div>
        </div>

        <!-- External Organizations (from forks) -->
        <div v-if="availableOrgs.externalOrgs.length > 0" class="org-column">
          <div class="org-category-header">
            <label class="checkbox-label category-checkbox">
              <input
                :checked="allExternalOrgsSelected"
                type="checkbox"
                class="checkbox"
                @change="toggleAllExternalOrgs"
              />
              <h3 class="org-category-title">Other</h3>
            </label>
          </div>
          <div class="org-list">
            <label v-for="org in availableOrgs.externalOrgs" :key="org" class="checkbox-label">
              <input
                v-model="orgFilterPreferences.enabledOrgs[org]"
                type="checkbox"
                class="checkbox"
                @change="saveOrgFilters"
              />
              <span>{{ org }}</span>
            </label>
          </div>
        </div>
      </div>

      <p v-if="orgFilterSaved" class="success small">✓ Organization filters saved</p>
    </div>

    <div v-if="isAuthenticated" class="section">
      <h2>Keyboard Shortcut</h2>
      <p class="instructions">Configure the keyboard shortcut to open Git Look Around.</p>

      <div class="shortcut-info">
        <div class="shortcut-display">
          <span v-if="shortcutKey" class="shortcut-key">{{ shortcutKey }}</span>
          <span v-else class="shortcut-key unset">Not configured</span>
        </div>
        <button class="btn-secondary" @click="openShortcutSettings">Configure Shortcut</button>
      </div>

      <div class="preferences hotkey-mode-section">
        <p class="instructions">Choose where the hotkey should work:</p>

        <label class="radio-label">
          <input
            v-model="hotkeyPreferences.mode"
            type="radio"
            value="github-only"
            class="radio"
            @change="onModeChange"
          />
          <span>Only on GitHub (github.com, gist.github.com)</span>
        </label>

        <label class="radio-label">
          <input
            v-model="hotkeyPreferences.mode"
            type="radio"
            value="custom-hosts"
            class="radio"
            @change="onModeChange"
          />
          <span>Custom websites (specify below)</span>
        </label>

        <div v-if="hotkeyPreferences.mode === 'custom-hosts'" class="custom-hosts-input">
          <input
            v-model="customHostsInput"
            type="text"
            placeholder="example.com, *.mycompany.com, jira.company.com"
            class="text-input"
            @blur="updateCustomHosts"
            @keyup.enter="updateCustomHosts"
          />
          <p class="hint">
            Comma-separated list of domains. Use * for wildcards. GitHub domains are always
            included.
          </p>
        </div>

        <p v-if="hotkeyPreferencesSaved" class="warning small">
          ⚠️ Extension will reload to apply changes...
        </p>
        <p v-else-if="hotkeyPreferences.mode === 'custom-hosts'" class="hint">
          Enter domains and press Enter or click outside to save
        </p>
      </div>
    </div>

    <div v-if="isAuthenticated" class="section">
      <h2>Developer Settings</h2>
      <p class="instructions">Developer options for troubleshooting and debugging.</p>

      <div class="preferences">
        <label class="checkbox-label">
          <input v-model="debugMode" type="checkbox" class="checkbox" @change="saveDebugModeFlag" />
          <span>Debug Mode (verbose console logging)</span>
        </label>
      </div>

      <p v-if="preferencesSaved" class="success small">✓ Preferences saved</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  saveGitHubToken,
  getGitHubToken,
  removeGitHubToken,
  getImportPreferences,
  saveImportPreferences,
  type ImportPreferences,
  getHotkeyPreferences,
  saveHotkeyPreferences,
  type HotkeyPreferences,
  getDebugMode,
  saveDebugMode,
  getOrgFilterPreferences,
  saveOrgFilterPreferences,
  type OrgFilterPreferences,
} from '@/src/storage/chrome';
import { getUniqueOrganizations, type CategorizedOrganizations } from '@/src/storage/db';

const tokenInput = ref('');
const actualToken = ref(''); // Store the actual token
const isAuthenticated = ref(false);
const error = ref('');
const tokenSaved = ref(false);
const showTooltip = ref(false);
const preferences = ref<ImportPreferences>({
  importIssues: true,
  importPullRequests: true,
});
const preferencesSaved = ref(false);
const debugMode = ref(false);
const shortcutKey = ref('');
const hotkeyPreferences = ref<HotkeyPreferences>({
  mode: 'github-only',
  customHosts: [],
});
const hotkeyPreferencesSaved = ref(false);
const customHostsInput = ref('');
const availableOrgs = ref<CategorizedOrganizations>({
  ownOrgs: [],
  externalOrgs: [],
});
const orgFilterPreferences = ref<OrgFilterPreferences>({
  enabledOrgs: {},
});
const orgFilterSaved = ref(false);

function maskToken(token: string): string {
  if (!token || token.length < 12) return token;
  // Show first 7 characters and last 4: "ghp_abc...xyz1"
  return `${token.substring(0, 7)}...${token.substring(token.length - 4)}`;
}

onMounted(async () => {
  const token = await getGitHubToken();
  isAuthenticated.value = !!token;

  // Show masked token if exists
  if (token) {
    actualToken.value = token;
    tokenInput.value = maskToken(token);
  }

  // Load preferences
  preferences.value = await getImportPreferences();
  debugMode.value = await getDebugMode();
  hotkeyPreferences.value = await getHotkeyPreferences();
  customHostsInput.value = hotkeyPreferences.value.customHosts.join(', ');

  console.log('[Options] Loaded hotkey preferences:', hotkeyPreferences.value);
  console.log('[Options] Custom hosts input:', customHostsInput.value);

  // Load organizations and org filter preferences
  if (isAuthenticated.value) {
    availableOrgs.value = await getUniqueOrganizations();
    orgFilterPreferences.value = await getOrgFilterPreferences();

    // Initialize missing orgs to enabled (default)
    const allOrgs = [...availableOrgs.value.ownOrgs, ...availableOrgs.value.externalOrgs];
    for (const org of allOrgs) {
      if (!(org in orgFilterPreferences.value.enabledOrgs)) {
        orgFilterPreferences.value.enabledOrgs[org] = true;
      }
    }
  }

  // Load keyboard shortcut
  await loadShortcut();
  console.log('[Options] After loadShortcut, shortcutKey:', shortcutKey.value);
});

async function loadShortcut() {
  try {
    const commands = await browser.commands.getAll();
    console.log('[Options] All commands:', commands);

    // Find toggle-overlay command specifically (not _execute_action)
    const toggleCommand = commands.find((cmd) => cmd.name === 'toggle-overlay');
    console.log('[Options] Toggle command:', toggleCommand);

    if (toggleCommand?.shortcut) {
      shortcutKey.value = toggleCommand.shortcut;
      console.log('[Options] Shortcut loaded:', shortcutKey.value);
    } else {
      console.log('[Options] No shortcut found');
    }
  } catch (e) {
    console.error('Failed to load shortcut:', e);
  }
}

function openShortcutSettings() {
  browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

async function saveToken() {
  const input = tokenInput.value.trim();

  // Don't save if empty or if it's the masked token
  if (!input || input.includes('...')) {
    error.value = 'Please enter a valid token';
    return;
  }

  try {
    await saveGitHubToken(input);
    actualToken.value = input;
    isAuthenticated.value = true;
    error.value = '';
    tokenSaved.value = true;

    // Show masked token
    tokenInput.value = maskToken(input);

    // Hide success message after 3 seconds
    window.setTimeout(() => {
      tokenSaved.value = false;
    }, 3000);
  } catch (e) {
    error.value = 'Failed to save token';
    tokenSaved.value = false;
    console.error(e);
  }
}

async function logout() {
  await removeGitHubToken();
  isAuthenticated.value = false;
  tokenInput.value = '';
  error.value = '';
  tokenSaved.value = false;
}

function handleTokenFocus() {
  // Clear masked token when user focuses to edit
  if (tokenInput.value.includes('...')) {
    tokenInput.value = '';
  }
}

async function savePreferences() {
  await saveImportPreferences(preferences.value);
  preferencesSaved.value = true;

  // Hide success message after 2 seconds
  window.setTimeout(() => {
    preferencesSaved.value = false;
  }, 2000);
}

async function saveDebugModeFlag() {
  await saveDebugMode(debugMode.value);
  preferencesSaved.value = true;

  // Hide success message after 2 seconds
  window.setTimeout(() => {
    preferencesSaved.value = false;
  }, 2000);
}

function updateCustomHosts() {
  const hosts = customHostsInput.value
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h.length > 0);

  console.log('[Options] Saving custom hosts:', hosts); // Debug log
  hotkeyPreferences.value.customHosts = hosts;
  saveHotkeyPrefs();
}

async function onModeChange() {
  console.log('[Options] Mode changed to:', hotkeyPreferences.value.mode); // Debug log

  // If switching to github-only, save immediately and reload
  if (hotkeyPreferences.value.mode === 'github-only') {
    await saveHotkeyPrefs();
  }
  // If switching to custom-hosts, just save the mode (not the hosts yet)
  // Don't reload yet - wait for user to enter domains
  else if (hotkeyPreferences.value.mode === 'custom-hosts') {
    // Save mode change without reloading
    await saveHotkeyPreferences(hotkeyPreferences.value);
  }
}

async function saveHotkeyPrefs() {
  await saveHotkeyPreferences(hotkeyPreferences.value);
  hotkeyPreferencesSaved.value = true;

  // Reload extension to apply changes
  window.setTimeout(() => {
    browser.runtime.reload();
  }, 1000);
}

async function saveOrgFilters() {
  await saveOrgFilterPreferences(orgFilterPreferences.value);
  orgFilterSaved.value = true;

  // Hide success message after 2 seconds
  window.setTimeout(() => {
    orgFilterSaved.value = false;
  }, 2000);
}

// Computed: Check if all own orgs are selected
const allOwnOrgsSelected = computed(() => {
  if (availableOrgs.value.ownOrgs.length === 0) return false;
  return availableOrgs.value.ownOrgs.every(
    (org) => orgFilterPreferences.value.enabledOrgs[org] === true,
  );
});

// Computed: Check if all external orgs are selected
const allExternalOrgsSelected = computed(() => {
  if (availableOrgs.value.externalOrgs.length === 0) return false;
  return availableOrgs.value.externalOrgs.every(
    (org) => orgFilterPreferences.value.enabledOrgs[org] === true,
  );
});

// Toggle all own orgs
function toggleAllOwnOrgs() {
  const newValue = !allOwnOrgsSelected.value;
  for (const org of availableOrgs.value.ownOrgs) {
    orgFilterPreferences.value.enabledOrgs[org] = newValue;
  }
  saveOrgFilters();
}

// Toggle all external orgs
function toggleAllExternalOrgs() {
  const newValue = !allExternalOrgsSelected.value;
  for (const org of availableOrgs.value.externalOrgs) {
    orgFilterPreferences.value.enabledOrgs[org] = newValue;
  }
  saveOrgFilters();
}
</script>

<style scoped>
.options-container {
  max-width: 40%;
  min-width: 600px;
  margin: 0px auto;
  padding: 8px 20px 12px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text-primary);
}

h1 {
  font-size: 32px;
  margin-bottom: 10px;
  color: var(--text-primary);
}

h2 {
  font-size: 20px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.section {
  background: var(--bg-secondary);
  padding: 0px 16px 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
}

.instructions {
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.steps {
  margin: 8px 0;
  padding-left: 20px;
  color: var(--text-primary);
}

.steps li {
  margin-bottom: 6px;
}

.steps code {
  background: var(--code-bg);
  color: var(--text-primary);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 14px;
}

.steps a {
  color: var(--link-color);
  text-decoration: none;
}

.steps a:hover {
  text-decoration: underline;
}

.help-link-wrapper {
  position: relative;
  display: inline-block;
}

.help-link {
  color: var(--link-color);
  text-decoration: none;
  font-size: 13px;
  margin-left: 8px;
  cursor: pointer;
}

.help-link:hover {
  text-decoration: underline;
}

.tooltip {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 8px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 350px;
  max-width: 500px;
}

.tooltip h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-primary);
}

.tooltip ol {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-primary);
}

.tooltip ol li {
  margin-bottom: 8px;
}

.tooltip code {
  background: var(--code-bg);
  color: var(--text-primary);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.tooltip a {
  color: var(--link-color);
  text-decoration: none;
  font-weight: 500;
}

.tooltip a:hover {
  text-decoration: underline;
}

.tooltip-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  line-height: 1;
}

.tooltip-close:hover {
  color: var(--text-primary);
}

.token-form {
  margin-top: 8px;
}

.token-input-group {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-input {
  flex: 1;
  padding: 10px;
  padding-right: 40px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-family: monospace;
  background: var(--input-bg);
  color: var(--text-primary);
}

.token-input:focus {
  outline: none;
  border-color: var(--link-color);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.token-status {
  position: absolute;
  right: 12px;
  font-size: 18px;
  font-weight: bold;
}

.token-status.success {
  color: var(--success-color);
}

.token-status.error {
  color: var(--error-color);
}

.token-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  font-size: 14px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.15s ease;
}

.btn-primary {
  background: var(--btn-primary-bg);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--btn-primary-hover);
}

.btn-primary:disabled {
  background: var(--btn-primary-disabled);
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--btn-secondary-bg);
  color: white;
}

.btn-secondary:hover {
  background: var(--btn-secondary-hover);
}

.success {
  color: var(--success-color);
  font-weight: 600;
  margin-bottom: 8px;
}

.error {
  color: var(--error-color);
  margin-top: 6px;
}

.auth-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.preferences {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 16px;
  user-select: none;
  color: var(--text-primary);
}

.checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--link-color);
}

.checkbox-label:hover {
  color: var(--link-color);
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 16px;
  user-select: none;
  color: var(--text-primary);
}

.radio {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--link-color);
}

.radio-label:hover {
  color: var(--link-color);
}

.hotkey-mode-section {
  margin-top: 12px;
}

.custom-hosts-input {
  margin-left: 28px;
  margin-top: 8px;
  margin-bottom: 8px;
}

.text-input {
  width: 100%;
  max-width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-primary);
  box-sizing: border-box;
}

.text-input:focus {
  outline: none;
  border-color: var(--link-color);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
  margin-bottom: 0;
}

.success.small {
  font-size: 14px;
  margin-top: 6px;
  margin-bottom: 0;
}

.warning {
  color: var(--warning-color);
  font-weight: 600;
  margin-bottom: 8px;
}

.warning.small {
  font-size: 14px;
  margin-top: 6px;
  margin-bottom: 0;
}

.shortcut-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
}

.shortcut-display {
  flex: 1;
}

.shortcut-key {
  display: inline-block;
  padding: 8px 16px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  background: var(--code-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
}

.shortcut-key.unset {
  color: var(--text-secondary);
  font-style: italic;
}

.org-columns {
  display: flex;
  gap: 20px;
  margin-top: 12px;
}

.org-column {
  flex: 1;
  min-width: 0;
}

.org-category-header {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-color);
}

.category-checkbox {
  cursor: pointer;
  user-select: none;
}

.category-checkbox .org-category-title {
  display: inline;
  font-size: 17px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

.org-category-title {
  font-size: 16px;
  font-weight: 600;
  margin-top: 12px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.org-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 186px; /* 6rows * 31 */
  overflow-y: auto;
  padding-right: 8px;
}

/* Custom scrollbar styling */
.org-list::-webkit-scrollbar {
  width: 8px;
}

.org-list::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: 4px;
}

.org-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.org-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
</style>
