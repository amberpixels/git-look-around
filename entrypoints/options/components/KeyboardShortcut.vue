<template>
  <div class="section">
    <h2>Keyboard Shortcut</h2>
    <p class="instructions">Configure the keyboard shortcut to open GitHub Look-Around.</p>

    <div class="shortcut-info">
      <div class="shortcut-display">
        <span v-if="shortcutKey" class="shortcut-key">{{ shortcutKey }}</span>
        <span v-else class="shortcut-key unset">Not configured</span>
      </div>
      <button class="btn-secondary" @click="$emit('openShortcutSettings')">
        Configure Shortcut
      </button>
    </div>

    <div class="preferences hotkey-mode-section">
      <p class="instructions">Choose where the hotkey should work:</p>

      <label class="radio-label">
        <input
          v-model="localPreferences.mode"
          type="radio"
          value="github-only"
          class="radio"
          @change="handleModeChange"
        />
        <span>Only on GitHub (github.com, gist.github.com)</span>
      </label>

      <label class="radio-label">
        <input
          v-model="localPreferences.mode"
          type="radio"
          value="custom-hosts"
          class="radio"
          @change="handleModeChange"
        />
        <span>Custom websites (specify below)</span>
      </label>

      <div v-if="localPreferences.mode === 'custom-hosts'" class="custom-hosts-input">
        <input
          v-model="localCustomHosts"
          type="text"
          placeholder="example.com, *.mycompany.com, jira.company.com"
          class="text-input"
          @blur="updateCustomHosts"
          @keyup.enter="updateCustomHosts"
        />
        <p class="hint">
          Comma-separated list of domains. Use * for wildcards. GitHub domains are always included.
        </p>
      </div>

      <p v-if="saved" class="warning small">⚠️ Extension will reload to apply changes...</p>
      <p v-else-if="localPreferences.mode === 'custom-hosts'" class="hint">
        Enter domains and press Enter or click outside to save
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface HotkeyPreferences {
  mode: 'github-only' | 'custom-hosts';
  customHosts: string[];
}

interface Props {
  shortcutKey: string;
  preferences: HotkeyPreferences;
  customHostsInput: string;
}

interface Emits {
  (e: 'openShortcutSettings'): void;
  (e: 'update:preferences', value: HotkeyPreferences): void;
  (e: 'update:customHostsInput', value: string): void;
  (e: 'save'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localPreferences = ref<HotkeyPreferences>({ ...props.preferences });
const localCustomHosts = ref(props.customHostsInput);
const saved = ref(false);

watch(
  () => props.preferences,
  (newPrefs) => {
    localPreferences.value = { ...newPrefs };
  },
  { deep: true },
);

watch(
  () => props.customHostsInput,
  (newValue) => {
    localCustomHosts.value = newValue;
  },
);

function handleModeChange() {
  emit('update:preferences', localPreferences.value);
  emit('save');
  showSavedMessage();
}

function updateCustomHosts() {
  emit('update:customHostsInput', localCustomHosts.value);
  emit('save');
  showSavedMessage();
}

function showSavedMessage() {
  saved.value = true;
  window.setTimeout(() => {
    saved.value = false;
  }, 3000);
}
</script>

<style scoped>
.section {
  margin-bottom: 32px;
}

.instructions {
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.shortcut-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.shortcut-display {
  flex: 1;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.shortcut-key {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.shortcut-key.unset {
  color: var(--text-secondary);
  font-style: italic;
}

.btn-secondary {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover {
  background: var(--border-color);
}

.preferences {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hotkey-mode-section {
  margin-top: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.radio {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.custom-hosts-input {
  margin-left: 26px;
  margin-top: 8px;
}

.text-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.text-input:focus {
  outline: none;
  border-color: var(--link-color);
}

.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.warning {
  color: #d29922;
  font-size: 13px;
  margin-top: 8px;
}

.small {
  font-size: 13px;
}
</style>
