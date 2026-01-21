<template>
  <div class="options-container">
    <h1>GitHub Look-Around Settings</h1>

    <div class="section">
      <div class="section-header">
        <h2>GitHub Authentication</h2>
        <button v-if="isAuthenticated" class="btn-sign-out-header" @click="handleSignOut">
          Sign Out
        </button>
      </div>

      <!-- Two-column layout when not authenticated -->
      <div v-if="!isAuthenticated" class="auth-columns">
        <!-- OAuth Column -->
        <div class="auth-column">
          <h3><span class="badge-recommended">Recommended</span> Sign in with GitHub</h3>
          <p class="instructions">
            One-click sign in - no tokens to create or manage. Just authorize and you're done.
          </p>
          <p class="auth-note">
            For organizations you don't own, the org admin may need to approve this app first.
          </p>

          <!-- Device Flow Active State -->
          <div v-if="deviceFlowActive" class="device-flow-container">
            <div class="device-flow-step">
              <h4>Step 1: Copy this code</h4>
              <div class="user-code-display">
                <span class="user-code">{{ userCode }}</span>
                <button
                  class="btn-copy"
                  :class="{ copied: codeCopied }"
                  :title="codeCopied ? 'Copied!' : 'Copy code'"
                  @click="copyUserCode"
                >
                  {{ codeCopied ? 'Copied' : 'Copy' }}
                </button>
              </div>
            </div>

            <div class="device-flow-step">
              <h4>Step 2: Authorize on GitHub</h4>
              <p class="device-flow-instructions">
                A new tab should have opened to GitHub. If not, click below:
              </p>
              <a :href="verificationUri" target="_blank" class="btn-secondary btn-github-link">
                Open GitHub Authorization
              </a>
            </div>

            <div class="device-flow-step">
              <h4>Step 3: Wait for confirmation</h4>
              <div class="polling-status">
                <div class="spinner"></div>
                <span>{{ deviceFlowStatus }}</span>
              </div>
            </div>

            <button class="btn-secondary btn-cancel" @click="cancelDeviceFlow">Cancel</button>
          </div>

          <!-- Normal State -->
          <div v-if="!deviceFlowActive" class="oauth-actions">
            <button
              class="btn-primary btn-oauth"
              :disabled="oauthLoading"
              @click="handleOAuthSignIn"
            >
              <span v-if="!oauthLoading">Sign in with GitHub</span>
              <span v-else>Starting authentication...</span>
            </button>
          </div>

          <p v-if="oauthError" class="error">{{ oauthError }}</p>
        </div>

        <!-- PAT Column -->
        <div class="auth-column">
          <h3>Personal Access Token (PAT)</h3>
          <ol class="pat-instructions">
            <li>
              <a
                href="https://github.com/settings/tokens/new?description=git-look-around&from=git-look-around"
                target="_blank"
                >Click here to open GitHub Token Settings</a
              >
            </li>
            <li>Permissions are highlighted</li>
            <li>Generate token, copy and paste below</li>
          </ol>

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
              <span v-if="error" class="token-status error" title="Token is invalid">✗</span>
            </div>

            <div class="token-actions">
              <button class="btn-primary" :disabled="!tokenInput" @click="saveToken">
                Save Token
              </button>
            </div>

            <p v-if="error" class="error">{{ error }}</p>
            <p v-if="tokenSaved" class="success small">✓ Token saved successfully</p>
          </div>
        </div>
      </div>

      <!-- Authenticated: Show single column for the active auth method -->
      <div v-if="isAuthenticated && authMethod === 'oauth'" class="auth-method-section">
        <AuthUserCard
          v-if="!deviceFlowActive"
          :user="githubUser"
          :auth-time="authMetadata?.authenticatedAt"
          :organizations="getSortedOrgs()"
          :scopes="['repo', 'read:user', 'read:org']"
        />
      </div>

      <div v-if="isAuthenticated && authMethod === 'pat'" class="auth-method-section">
        <AuthUserCard
          :user="githubUser"
          :auth-time="authMetadata?.authenticatedAt"
          :organizations="getSortedOrgs()"
          :scopes="['repo', 'read:user', 'read:org']"
        />

        <div class="token-update-form">
          <input
            v-model="tokenInput"
            type="text"
            placeholder="Paste new token to update"
            class="token-input"
            @keyup.enter="saveToken"
          />
          <button v-if="tokenHasChanged" class="btn-primary btn-update-token" @click="saveToken">
            Update
          </button>
          <span v-else class="token-status success" title="Token is valid">✓</span>
        </div>
      </div>
    </div>

    <SyncPreferences
      v-if="isAuthenticated"
      :preferences="preferences"
      @update:preferences="preferences = $event"
      @save="savePreferences"
    />

    <OrganizationFilters
      v-if="isAuthenticated"
      :my-orgs="availableOrgs.myOrgs"
      :contributing-orgs="availableOrgs.contributingOrgs"
      :fork-source-orgs="availableOrgs.forkSourceOrgs"
      :filters="orgFilterPreferences"
      @update:filters="orgFilterPreferences = $event"
      @save="saveOrgFilters"
    />

    <KeyboardShortcut
      v-if="isAuthenticated"
      :shortcut-key="shortcutKey"
      :preferences="hotkeyPreferences"
      @open-shortcut-settings="openShortcutSettings"
      @update:preferences="hotkeyPreferences = $event"
      @save="onModeChange"
    />

    <DeveloperSettings
      v-if="isAuthenticated"
      :debug-mode="debugMode"
      @update:debug-mode="debugMode = $event"
      @save="saveDebugModeFlag"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import AuthUserCard from '@/src/components/AuthUserCard.vue';
import SyncPreferences from './components/SyncPreferences.vue';
import OrganizationFilters from './components/OrganizationFilters.vue';
import KeyboardShortcut from './components/KeyboardShortcut.vue';
import DeveloperSettings from './components/DeveloperSettings.vue';
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
  getAuthMetadata,
  getAuthMethod,
  saveAuthMetadata,
  removeAuthMetadata,
  type AuthMetadata,
} from '@/src/storage/chrome';
import { getUniqueOrganizations, type CategorizedOrganizations } from '@/src/storage/db';
import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import { debugLog } from '@/src/utils/debug';
import { startDeviceFlow, completeDeviceFlow } from '@/src/auth/oauth-service';
import { getUserOrganizations } from '@/src/api/github';

const tokenInput = ref('');
const actualToken = ref(''); // Store the actual token
const originalMaskedToken = ref(''); // Store the original masked token to detect changes
const isAuthenticated = ref(false);
const error = ref('');
const tokenSaved = ref(false);
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
const reloadTimeoutId = ref<number | null>(null);
const availableOrgs = ref<CategorizedOrganizations>({
  myOrgs: [],
  contributingOrgs: [],
  forkSourceOrgs: [],
});
const orgFilterPreferences = ref<OrgFilterPreferences>({
  enabledOrgs: {},
});
const orgFilterSaved = ref(false);

// OAuth Device Flow state
const oauthLoading = ref(false);
const oauthError = ref('');
const authMethod = ref<'oauth' | 'pat' | null>(null);
const authMetadata = ref<AuthMetadata | null>(null);
const deviceFlowActive = ref(false);
const _deviceCode = ref('');
const userCode = ref('');
const verificationUri = ref('');
const deviceFlowStatus = ref('');
const codeCopied = ref(false);
const githubUser = ref<{ login: string; avatar_url: string } | null>(null);

// Computed: detect if token input has changed from original (for showing Update button)
const tokenHasChanged = computed(() => {
  // Only consider changed if there's input and it differs from original
  return tokenInput.value.length > 0 && tokenInput.value !== originalMaskedToken.value;
});

function maskToken(token: string): string {
  if (!token || token.length < 12) return token;
  // Show first 7 characters and last 4: "ghp_abc...xyz1"
  return `${token.substring(0, 7)}...${token.substring(token.length - 4)}`;
}

onMounted(async () => {
  const token = await getGitHubToken();
  isAuthenticated.value = !!token;

  // Load auth method and metadata
  authMethod.value = await getAuthMethod();
  authMetadata.value = await getAuthMetadata();

  // Show masked token if exists and using PAT
  if (token && authMethod.value === 'pat') {
    actualToken.value = token;
    const masked = maskToken(token);
    tokenInput.value = masked;
    originalMaskedToken.value = masked;
  }

  // Load preferences
  preferences.value = await getImportPreferences();
  debugMode.value = await getDebugMode();
  hotkeyPreferences.value = await getHotkeyPreferences();

  void debugLog('[Options] Loaded hotkey preferences:', hotkeyPreferences.value);

  // Load organizations and org filter preferences
  if (isAuthenticated.value) {
    // Load GitHub user info first (needed to build myOrgs list)
    if (authMethod.value === 'oauth' || authMethod.value === 'pat') {
      await loadGitHubUserInfo();
      await fetchOrganizationsFromAPI();
    }

    orgFilterPreferences.value = await getOrgFilterPreferences();

    // Initialize missing orgs to enabled (myOrgs) or disabled (external)
    const allOrgs = [
      ...availableOrgs.value.myOrgs,
      ...availableOrgs.value.contributingOrgs,
      ...availableOrgs.value.forkSourceOrgs,
    ];
    for (const org of allOrgs) {
      if (!(org in orgFilterPreferences.value.enabledOrgs)) {
        // Default: myOrgs enabled, external orgs disabled
        const isMyOrg = availableOrgs.value.myOrgs.some(
          (o) => o.toLowerCase() === org.toLowerCase(),
        );
        orgFilterPreferences.value.enabledOrgs[org] = isMyOrg;
      }
    }
  }

  // Load keyboard shortcut
  await loadShortcut();
  void debugLog('[Options] After loadShortcut, shortcutKey:', shortcutKey.value);

  // Listen for storage changes to reload org list when sync discovers new orgs
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.org_filter_preferences) {
      void reloadOrganizations();
    }
  });
});

async function reloadOrganizations() {
  if (!isAuthenticated.value) return;

  // Get my orgs from current state (or re-fetch from API if needed)
  const myOrgsFromAPI = availableOrgs.value.myOrgs.length > 0 ? availableOrgs.value.myOrgs : [];

  availableOrgs.value = await getUniqueOrganizations(myOrgsFromAPI);
  orgFilterPreferences.value = await getOrgFilterPreferences();
}

async function loadShortcut() {
  try {
    const commands = await browser.commands.getAll();
    void debugLog('[Options] All commands:', commands);

    // Find toggle-overlay command specifically (not _execute_action)
    const toggleCommand = commands.find((cmd) => cmd.name === 'toggle-overlay');
    void debugLog('[Options] Toggle command:', toggleCommand);

    if (toggleCommand?.shortcut) {
      shortcutKey.value = toggleCommand.shortcut;
      void debugLog('[Options] Shortcut loaded:', shortcutKey.value);
    } else {
      void debugLog('[Options] No shortcut found');
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
    await saveAuthMetadata({
      method: 'pat',
      authenticatedAt: Date.now(),
    });

    actualToken.value = input;
    isAuthenticated.value = true;
    authMethod.value = 'pat';
    authMetadata.value = await getAuthMetadata();
    error.value = '';
    tokenSaved.value = true;

    // Load user info and orgs
    await loadGitHubUserInfo();
    await fetchOrganizationsFromAPI();

    // Show masked token and update original for change detection
    const masked = maskToken(input);
    tokenInput.value = masked;
    originalMaskedToken.value = masked;

    // Notify background script to trigger sync
    const message: ExtensionMessage = {
      type: MessageType.TOKEN_SAVED,
    };
    browser.runtime.sendMessage(message).catch((err) => {
      console.error('[Options] Failed to notify background about token save:', err);
    });

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

async function onModeChange() {
  // Save preferences
  await saveHotkeyPreferences(hotkeyPreferences.value);
  hotkeyPreferencesSaved.value = true;

  // Cancel any previous reload timeout
  if (reloadTimeoutId.value !== null) {
    window.clearTimeout(reloadTimeoutId.value);
  }

  // Schedule extension reload to apply changes
  // Give it 1.5 seconds to ensure the save completes
  reloadTimeoutId.value = window.setTimeout(() => {
    browser.runtime.reload();
  }, 1500);
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
// OAuth Device Flow functions
async function handleOAuthSignIn() {
  oauthLoading.value = true;
  oauthError.value = '';
  deviceFlowActive.value = false;

  try {
    // Step 1: Request device code
    const startResult = await startDeviceFlow();

    if (
      !startResult.success ||
      !startResult.userCode ||
      !startResult.verificationUri ||
      !startResult.deviceCode
    ) {
      oauthError.value = startResult.error || 'Failed to start authentication';
      oauthLoading.value = false;
      return;
    }

    // Show device code to user
    deviceFlowActive.value = true;
    userCode.value = startResult.userCode;
    verificationUri.value = startResult.verificationUri;
    deviceFlowStatus.value = 'Waiting for authorization...';

    // Auto-open GitHub verification page
    window.open(startResult.verificationUri, '_blank');

    // Step 2: Poll for authorization using the same device code
    const completeResult = await completeDeviceFlow(
      startResult.deviceCode,
      startResult.interval || 5,
      startResult.expiresIn || 900,
      (status) => {
        deviceFlowStatus.value = status;
      },
    );

    if (completeResult.success) {
      isAuthenticated.value = true;
      authMethod.value = 'oauth';
      authMetadata.value = await getAuthMetadata();
      deviceFlowActive.value = false;

      // Clear PAT input if switching from PAT
      tokenInput.value = '';
      actualToken.value = '';

      // Load GitHub user info
      await loadGitHubUserInfo();

      // Load organizations from GitHub API
      await fetchOrganizationsFromAPI();

      // Notify background to trigger sync
      const message: ExtensionMessage = {
        type: MessageType.TOKEN_SAVED,
      };
      await browser.runtime.sendMessage(message);
    } else {
      oauthError.value = completeResult.error || 'Authentication failed';
      deviceFlowActive.value = false;
    }
  } catch (err) {
    oauthError.value = 'Failed to authenticate. Please try again.';
    deviceFlowActive.value = false;
    console.error('[Options] Device Flow error:', err);
  } finally {
    oauthLoading.value = false;
  }
}

function cancelDeviceFlow() {
  deviceFlowActive.value = false;
  oauthLoading.value = false;
  deviceFlowStatus.value = '';
  oauthError.value = '';
  codeCopied.value = false;
}

function copyUserCode() {
  window.navigator.clipboard.writeText(userCode.value);
  codeCopied.value = true;

  // Reset after 2 seconds
  window.setTimeout(() => {
    codeCopied.value = false;
  }, 2000);
}

async function handleSignOut() {
  // Works for both OAuth and PAT - removes token and metadata
  await removeGitHubToken();
  await removeAuthMetadata();
  isAuthenticated.value = false;
  authMethod.value = null;
  authMetadata.value = null;
  tokenInput.value = '';
  error.value = '';
  oauthError.value = '';
}

async function loadGitHubUserInfo() {
  try {
    // Fetch user info
    const userResponse = await window.fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${await getGitHubToken()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (userResponse.ok) {
      const userData = await userResponse.json();
      githubUser.value = {
        login: userData.login,
        avatar_url: userData.avatar_url,
      };
    }
  } catch (error) {
    console.error('[Options] Failed to load GitHub user info:', error);
  }
}

async function fetchOrganizationsFromAPI() {
  try {
    // Fetch organizations from GitHub API
    const orgs = await getUserOrganizations();
    const orgNames = orgs.map((org) => org.login);
    const username = githubUser.value?.login;

    // Build list of "my orgs" (personal account + orgs from API)
    const myOrgsFromAPI: string[] = [...orgNames];
    if (username && !myOrgsFromAPI.includes(username)) {
      myOrgsFromAPI.unshift(username);
    }

    // Save myOrgs list to storage (so engine.ts can use it during sync)
    const { saveMyOrgsFromAPI } = await import('@/src/storage/chrome');
    await saveMyOrgsFromAPI(myOrgsFromAPI);

    // Get categorized orgs from IndexedDB, passing myOrgs list
    availableOrgs.value = await getUniqueOrganizations(myOrgsFromAPI);

    // Initialize org filter preferences for new orgs
    const currentFilters = await getOrgFilterPreferences();
    const allOrgs = [
      ...availableOrgs.value.myOrgs,
      ...availableOrgs.value.contributingOrgs,
      ...availableOrgs.value.forkSourceOrgs,
    ];
    for (const org of allOrgs) {
      if (!(org in currentFilters.enabledOrgs)) {
        // Default: myOrgs enabled, external orgs disabled
        const isMyOrg = availableOrgs.value.myOrgs.some(
          (o) => o.toLowerCase() === org.toLowerCase(),
        );
        currentFilters.enabledOrgs[org] = isMyOrg;
      }
    }
    orgFilterPreferences.value = currentFilters;
  } catch (error) {
    console.error('[Options] Failed to fetch organizations from API:', error);
  }
}

function getSortedOrgs(): string[] {
  if (!availableOrgs.value.myOrgs.length) return [];

  const username = githubUser.value?.login;
  const orgs = [...availableOrgs.value.myOrgs];

  // Put user's personal org (same as username) first
  if (username) {
    const personalOrgIndex = orgs.findIndex((org) => org.toLowerCase() === username.toLowerCase());
    if (personalOrgIndex > -1) {
      const [personalOrg] = orgs.splice(personalOrgIndex, 1);
      orgs.unshift(personalOrg);
    }
  }

  return orgs;
}
</script>

<style scoped>
.options-container {
  width: 100%;
  max-width: 800px;
  margin: 0px auto;
  padding: 8px 20px 12px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text-primary);
  box-sizing: border-box;
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

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.btn-sign-out-header {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
  white-space: nowrap;
}

.btn-sign-out-header:hover {
  background: #c82333;
}

.instructions {
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.auth-note {
  font-size: 13px;
  margin: 4px 0 12px 0;
  color: var(--text-secondary);
  font-style: italic;
}

.pat-instructions {
  margin: 8px 0 12px 0;
  padding-left: 20px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
}

.pat-instructions li {
  margin-bottom: 6px;
}

.pat-instructions a {
  color: var(--link-color);
  text-decoration: none;
  font-weight: 500;
}

.pat-instructions a:hover {
  text-decoration: underline;
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
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
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

.token-update-form {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.token-update-form .token-input {
  flex: 1;
  padding-right: 12px; /* No space needed for absolute positioned checkmark */
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  letter-spacing: 0.5px;
}

.token-update-form .token-status {
  position: static;
  flex-shrink: 0;
}

.btn-update-token {
  flex-shrink: 0;
  padding: 10px 16px;
}

.token-input-group {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-display-group {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.token-display-group .token-input {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  cursor: default;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  letter-spacing: 0.5px;
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

/* OAuth UI Styles */
.auth-columns {
  display: flex;
  gap: 24px;
}

.auth-column {
  flex: 1;
  min-width: 0;
}

.auth-column h3 {
  font-size: 16px;
  margin-bottom: 8px;
  margin-top: 0;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.badge-recommended {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(46, 164, 79, 0.15);
  color: #2ea44f;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

@media (prefers-color-scheme: dark) {
  .badge-recommended {
    background: rgba(46, 164, 79, 0.2);
    color: #3fb950;
  }
}

.auth-method-section {
  margin-bottom: 24px;
}

.auth-method-section h3 {
  font-size: 17px;
  margin-bottom: 8px;
  margin-top: 12px;
  color: var(--text-primary);
}

/* OAuth Actions */
.oauth-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-oauth {
  background: #2ea44f;
}

.btn-oauth:hover:not(:disabled) {
  background: #2c974b;
}

.btn-oauth:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Device Flow UI Styles */
.device-flow-container {
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  margin: 16px 0;
}

.device-flow-step {
  margin-bottom: 20px;
}

.device-flow-step:last-of-type {
  margin-bottom: 12px;
}

.device-flow-step h4 {
  font-size: 15px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-weight: 600;
}

.user-code-display {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--code-bg);
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.user-code {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text-primary);
  flex: 1;
}

.btn-copy {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  background: var(--link-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
}

.btn-copy:hover {
  background: #0969da;
}

.btn-copy.copied {
  background: #2ea44f;
}

.btn-copy.copied:hover {
  background: #2c974b;
}

.device-flow-instructions {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.btn-github-link {
  display: inline-block;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.polling-status {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid var(--border-color);
  border-top-color: var(--link-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.btn-cancel {
  margin-top: 12px;
}
</style>
