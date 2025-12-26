<template>
  <div class="section">
    <h2>Organization Filters</h2>
    <p class="instructions">
      Choose which organizations to include in search results. Unchecked organizations will be
      excluded.
    </p>

    <div class="org-columns">
      <!-- Own Organizations -->
      <div v-if="ownOrgs.length > 0" class="org-column">
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
          <label v-for="org in ownOrgs" :key="org" class="checkbox-label">
            <input
              v-model="localFilters.enabledOrgs[org]"
              type="checkbox"
              class="checkbox"
              @change="handleChange"
            />
            <span>{{ org }}</span>
          </label>
        </div>
      </div>

      <!-- External Organizations (from forks) -->
      <div v-if="externalOrgs.length > 0" class="org-column">
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
          <label v-for="org in externalOrgs" :key="org" class="checkbox-label">
            <input
              v-model="localFilters.enabledOrgs[org]"
              type="checkbox"
              class="checkbox"
              @change="handleChange"
            />
            <span>{{ org }}</span>
          </label>
        </div>
      </div>
    </div>

    <p v-if="saved" class="success small">✓ Organization filters saved</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface OrgFilterPreferences {
  enabledOrgs: Record<string, boolean>;
}

interface Props {
  ownOrgs: string[];
  externalOrgs: string[];
  filters: OrgFilterPreferences;
}

interface Emits {
  (e: 'update:filters', value: OrgFilterPreferences): void;
  (e: 'save'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localFilters = ref<OrgFilterPreferences>({ ...props.filters });
const saved = ref(false);

watch(
  () => props.filters,
  (newFilters) => {
    localFilters.value = { ...newFilters };
  },
  { deep: true },
);

const allOwnOrgsSelected = computed(() => {
  return props.ownOrgs.every((org) => localFilters.value.enabledOrgs[org]);
});

const allExternalOrgsSelected = computed(() => {
  return props.externalOrgs.every((org) => localFilters.value.enabledOrgs[org]);
});

function toggleAllOwnOrgs() {
  const newValue = !allOwnOrgsSelected.value;
  props.ownOrgs.forEach((org) => {
    localFilters.value.enabledOrgs[org] = newValue;
  });
  handleChange();
}

function toggleAllExternalOrgs() {
  const newValue = !allExternalOrgsSelected.value;
  props.externalOrgs.forEach((org) => {
    localFilters.value.enabledOrgs[org] = newValue;
  });
  handleChange();
}

function handleChange() {
  emit('update:filters', localFilters.value);
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

.org-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
}

.org-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.org-category-header {
  margin-bottom: 4px;
}

.category-checkbox {
  font-weight: 600;
}

.org-category-title {
  font-size: 15px;
  margin: 0;
  color: var(--text-primary);
}

.org-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
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
  flex-shrink: 0;
}

.success {
  color: #2ea44f;
  font-size: 13px;
  margin-top: 8px;
}

.small {
  font-size: 13px;
}

/* Scrollbar styling */
.org-list::-webkit-scrollbar {
  width: 8px;
}

.org-list::-webkit-scrollbar-track {
  background: var(--bg-primary);
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
