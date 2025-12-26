<template>
  <div class="section">
    <h2>Developer Settings</h2>
    <p class="instructions">Developer options for troubleshooting and debugging.</p>

    <div class="preferences">
      <label class="checkbox-label">
        <input v-model="localDebugMode" type="checkbox" class="checkbox" @change="handleChange" />
        <span>Debug Mode (verbose console logging)</span>
      </label>
    </div>

    <p v-if="saved" class="success small">✓ Preferences saved</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  debugMode: boolean;
}

interface Emits {
  (e: 'update:debugMode', value: boolean): void;
  (e: 'save'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localDebugMode = ref(props.debugMode);
const saved = ref(false);

watch(
  () => props.debugMode,
  (newValue) => {
    localDebugMode.value = newValue;
  },
);

function handleChange() {
  emit('update:debugMode', localDebugMode.value);
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
