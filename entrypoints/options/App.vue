<template>
  <div class="options-container">
    <h1>GitHub Look-Around Settings</h1>

    <div class="section">
      <div class="section-header">
        <h2>GitHub Authentication</h2>
        <button
          v-if="isAuthenticated && authMethod === 'oauth'"
          class="btn-sign-out-header"
          @click="handleSignOut"
        >
          Sign Out
        </button>
      </div>

      <!-- OAuth Section -->
      <div v-if="!isAuthenticated || authMethod === 'oauth'" class="auth-method-section">
        <h3 v-if="!isAuthenticated">Recommended: Sign in with GitHub</h3>
        <p v-if="!isAuthenticated" class="instructions">
          Secure authentication using GitHub Device Flow. Direct communication with GitHub - no
          intermediary servers.
        </p>

        <div
          v-if="authMethod === 'oauth' && isAuthenticated && !deviceFlowActive"
          class="oauth-user-card"
        >
          <div class="card-header">
            <div class="user-header">
              <img
                v-if="githubUser?.avatar_url"
                :src="githubUser.avatar_url"
                class="user-avatar"
                alt="Avatar"
              />
              <div class="user-info">
                <div class="user-name">
                  <span class="status-icon">✓</span>
                  <span class="username">{{ githubUser?.login || 'GitHub User' }}</span>
                </div>
                <span class="auth-time"
                  >Authenticated {{ formatAuthDate(authMetadata?.authenticatedAt) }}</span
                >
              </div>
            </div>

            <div class="scopes-info">
              <span class="scope-badge">repo</span>
              <span class="scope-badge">read:user</span>
              <span class="scope-badge">read:org</span>
            </div>
          </div>

          <div v-if="availableOrgs.ownOrgs.length > 0" class="org-info-inline">
            <span class="org-label">Organizations: ({{ availableOrgs.ownOrgs.length }})</span>
            {{ getSortedOrgs().slice(0, 20).join(', ')
            }}<span v-if="availableOrgs.ownOrgs.length > 20"
              >, +{{ availableOrgs.ownOrgs.length - 20 }} more</span
            >
          </div>
        </div>

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
        <div v-if="!deviceFlowActive && !isAuthenticated" class="oauth-actions">
          <button class="btn-primary btn-oauth" :disabled="oauthLoading" @click="handleOAuthSignIn">
            <span v-if="!oauthLoading">Sign in with GitHub</span>
            <span v-else>Starting authentication...</span>
          </button>
        </div>

        <p v-if="oauthError" class="error">{{ oauthError }}</p>
      </div>

      <!-- Divider (only show when not authenticated) -->
      <div v-if="!isAuthenticated" class="divider">
        <span>OR</span>
      </div>

      <!-- PAT Section -->
      <div v-if="!isAuthenticated || authMethod === 'pat'" class="auth-method-section">
        <h3 v-if="!isAuthenticated">Advanced: Personal Access Token</h3>
        <ol v-if="!isAuthenticated" class="pat-instructions">
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

        <!-- PAT Authenticated Card (matching OAuth style) -->
        <div v-if="authMethod === 'pat' && isAuthenticated" class="oauth-user-card">
          <div class="card-header">
            <div class="user-header">
              <img
                v-if="githubUser?.avatar_url"
                :src="githubUser.avatar_url"
                class="user-avatar"
                alt="Avatar"
              />
              <div class="user-info">
                <div class="user-name">
                  <span class="status-icon">✓</span>
                  <span class="username">{{ githubUser?.login || 'GitHub User' }}</span>
                </div>
                <span class="auth-time"
                  >Authenticated {{ formatAuthDate(authMetadata?.authenticatedAt) }}</span
                >
              </div>
            </div>

            <div class="scopes-info">
              <span class="scope-badge">repo</span>
              <span class="scope-badge">read:user</span>
              <span class="scope-badge">read:org</span>
            </div>
          </div>

          <div v-if="availableOrgs.ownOrgs.length > 0" class="org-info-inline">
            <span class="org-label">Organizations: ({{ availableOrgs.ownOrgs.length }})</span>
            {{ getSortedOrgs().slice(0, 20).join(', ')
            }}<span v-if="availableOrgs.ownOrgs.length > 20"
              >, +{{ availableOrgs.ownOrgs.length - 20 }} more</span
            >
          </div>
        </div>

        <div class="token-form">
          <div v-if="authMethod === 'pat' && isAuthenticated" class="token-display-group">
            <input v-model="tokenInput" type="text" class="token-input" readonly />
            <span class="token-status success" title="Token is valid">✓</span>
          </div>

          <div v-else class="token-input-group">
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

          <div v-if="authMethod === 'pat' && isAuthenticated" class="token-actions">
            <button class="btn-primary" @click="handleTokenFocus">Update Token</button>
            <button class="btn-secondary" @click="logout">Clear</button>
          </div>

          <div v-else class="token-actions">
            <button class="btn-primary" :disabled="!tokenInput" @click="saveToken">
              Save Token
            </button>
          </div>

          <p v-if="error" class="error">{{ error }}</p>
          <p v-if="tokenSaved" class="success small">✓ Token saved successfully</p>
        </div>
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
      <p class="instructions">Configure the keyboard shortcut to open GitHub Look-Around.</p>

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
  getAuthMetadata,
  getAuthMethod,
  saveAuthMetadata,
  removeAuthMetadata,
  type AuthMetadata,
} from '@/src/storage/chrome';
import { getUniqueOrganizations, type CategorizedOrganizations } from '@/src/storage/db';
import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';
import {
  startDeviceFlow,
  completeDeviceFlow,
  signOut as oauthSignOut,
} from '@/src/auth/oauth-service';

const tokenInput = ref('');
const actualToken = ref(''); // Store the actual token
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
const customHostsInput = ref('');
const availableOrgs = ref<CategorizedOrganizations>({
  ownOrgs: [],
  externalOrgs: [],
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

    // Load GitHub user info for both OAuth and PAT
    if (authMethod.value === 'oauth' || authMethod.value === 'pat') {
      await loadGitHubUserInfo();
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

    // Show masked token
    tokenInput.value = maskToken(input);

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

async function logout() {
  await removeGitHubToken();
  await removeAuthMetadata();
  isAuthenticated.value = false;
  authMethod.value = null;
  authMetadata.value = null;
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

      // Load organizations
      availableOrgs.value = await getUniqueOrganizations();

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
  await oauthSignOut();
  isAuthenticated.value = false;
  authMethod.value = null;
  authMetadata.value = null;
  oauthError.value = '';
}

function formatAuthDate(timestamp: number | undefined): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - timestamp;

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  // Fallback: show date
  return new Date(timestamp).toLocaleDateString();
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

function getSortedOrgs(): string[] {
  if (!availableOrgs.value.ownOrgs.length) return [];

  const username = githubUser.value?.login;
  const orgs = [...availableOrgs.value.ownOrgs];

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

/* OAuth UI Styles */
.auth-method-section {
  margin-bottom: 24px;
}

.auth-method-section h3 {
  font-size: 17px;
  margin-bottom: 8px;
  margin-top: 12px;
  color: var(--text-primary);
}

.divider {
  display: flex;
  align-items: center;
  margin: 24px 0;
  text-align: center;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-color);
}

.divider span {
  padding: 0 16px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

/* OAuth User Card */
.oauth-user-card {
  background: var(--bg-primary);
  border: 2px solid #2ea44f;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.user-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-icon {
  color: #2ea44f;
  font-size: 18px;
}

.username {
  color: var(--text-primary);
}

.auth-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.org-info-inline {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

.org-label {
  color: var(--text-secondary);
  margin-right: 6px;
  font-weight: 600;
}

.scopes-info {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.scope-badge {
  display: inline-block;
  padding: 2px 6px;
  background: #ddf4ff;
  color: #0969da;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.auth-status-display {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.status-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
}

.status-badge.success {
  background: #d4edda;
  color: #155724;
}

.auth-date {
  font-size: 13px;
  color: var(--text-secondary);
}

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
