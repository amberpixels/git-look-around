<template>
  <div class="section">
    <h2>Sync (Import) Preferences</h2>
    <p class="instructions">
      Choose what data to sync from GitHub (repositories are always synced).
    </p>

    <div class="preferences">
      <label class="checkbox-label">
        <input
          v-model="localPreferences.importIssues"
          type="checkbox"
          class="checkbox"
          @change="handleChange"
        />
        <span>Sync Issues</span>
      </label>

      <label class="checkbox-label">
        <input
          v-model="localPreferences.importPullRequests"
          type="checkbox"
          class="checkbox"
          @change="handleChange"
        />
        <span>Sync Pull Requests</span>
      </label>
    </div>

    <p v-if="saved" class="success small">✓ Preferences saved</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface ImportPreferences {
  importIssues: boolean;
  importPullRequests: boolean;
}

interface Props {
  preferences: ImportPreferences;
}

interface Emits {
  (e: 'update:preferences', value: ImportPreferences): void;
  (e: 'save'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localPreferences = ref<ImportPreferences>({ ...props.preferences });
const saved = ref(false);

// Watch for external changes
watch(
  () => props.preferences,
  (newPrefs) => {
    localPreferences.value = { ...newPrefs };
  },
  { deep: true },
);

function handleChange() {
  emit('update:preferences', localPreferences.value);
  emit('save');

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

.preferences {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.success {
  color: #2ea44f;
  font-size: 13px;
  margin-top: 8px;
}

.small {
  font-size: 13px;
}
</style>
