<template>
  <div class="section">
    <h2>Organization Filters</h2>
    <p class="instructions">
      Choose which organizations to include in search results. Unchecked organizations will be
      excluded.
    </p>

    <div
      v-if="myOrgs.length === 0 && contributingOrgs.length === 0 && forkSourceOrgs.length === 0"
      class="empty-state"
    >
      <p v-if="loading">Loading organizations...</p>
      <p v-else>
        No organizations found yet. Organizations will appear after the initial sync completes.
      </p>
    </div>

    <div v-else class="org-columns">
      <!-- My Organizations -->
      <div class="org-column">
        <div v-if="myOrgs.length > 0">
          <div class="org-category-header">
            <label class="checkbox-label category-checkbox">
              <input
                ref="myOrgsCheckbox"
                :checked="allMyOrgsSelected"
                type="checkbox"
                class="checkbox"
                @change="toggleAllMyOrgs"
              />
              <h3 class="org-category-title">My Organizations</h3>
            </label>
          </div>
          <div class="org-list">
            <label v-for="org in myOrgs" :key="org" class="checkbox-label">
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

      <!-- Contributing To (external orgs with direct repos) -->
      <div class="org-column">
        <div v-if="contributingOrgs.length > 0">
          <div class="org-category-header">
            <label class="checkbox-label category-checkbox">
              <input
                ref="contributingOrgsCheckbox"
                :checked="allContributingOrgsSelected"
                type="checkbox"
                class="checkbox"
                @change="toggleAllContributingOrgs"
              />
              <h3 class="org-category-title">Contributing To</h3>
            </label>
          </div>
          <div class="org-list">
            <label v-for="org in contributingOrgs" :key="org" class="checkbox-label">
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

      <!-- Fork Sources (orgs with only fork parent repos) -->
      <div class="org-column">
        <div v-if="forkSourceOrgs.length > 0">
          <div class="org-category-header">
            <label class="checkbox-label category-checkbox">
              <input
                ref="forkSourceOrgsCheckbox"
                :checked="allForkSourceOrgsSelected"
                type="checkbox"
                class="checkbox"
                @change="toggleAllForkSourceOrgs"
              />
              <h3 class="org-category-title">Fork Sources</h3>
            </label>
          </div>
          <div class="org-list">
            <label v-for="org in forkSourceOrgs" :key="org" class="checkbox-label">
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
    </div>

    <p v-if="saved" class="success small">✓ Organization filters saved</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';

interface OrgFilterPreferences {
  enabledOrgs: Record<string, boolean>;
}

interface Props {
  myOrgs: string[];
  contributingOrgs: string[];
  forkSourceOrgs: string[];
  filters: OrgFilterPreferences;
  loading?: boolean;
}

interface Emits {
  (e: 'update:filters', value: OrgFilterPreferences): void;
  (e: 'save'): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});
const emit = defineEmits<Emits>();

const localFilters = ref<OrgFilterPreferences>({ ...props.filters });
const saved = ref(false);

// Template refs for header checkboxes (to set indeterminate state)
const myOrgsCheckbox = ref<HTMLInputElement | null>(null);
const contributingOrgsCheckbox = ref<HTMLInputElement | null>(null);
const forkSourceOrgsCheckbox = ref<HTMLInputElement | null>(null);

watch(
  () => props.filters,
  (newFilters) => {
    localFilters.value = { ...newFilters };
  },
  { deep: true },
);

// Computed: count selected orgs in each category
const myOrgsSelectedCount = computed(() => {
  return props.myOrgs.filter((org) => localFilters.value.enabledOrgs[org]).length;
});

const contributingOrgsSelectedCount = computed(() => {
  return props.contributingOrgs.filter((org) => localFilters.value.enabledOrgs[org]).length;
});

const forkSourceOrgsSelectedCount = computed(() => {
  return props.forkSourceOrgs.filter((org) => localFilters.value.enabledOrgs[org]).length;
});

// Computed: check if all/some/none are selected
const allMyOrgsSelected = computed(() => myOrgsSelectedCount.value === props.myOrgs.length);
const someMyOrgsSelected = computed(
  () => myOrgsSelectedCount.value > 0 && !allMyOrgsSelected.value,
);

const allContributingOrgsSelected = computed(
  () => contributingOrgsSelectedCount.value === props.contributingOrgs.length,
);
const someContributingOrgsSelected = computed(
  () => contributingOrgsSelectedCount.value > 0 && !allContributingOrgsSelected.value,
);

const allForkSourceOrgsSelected = computed(
  () => forkSourceOrgsSelectedCount.value === props.forkSourceOrgs.length,
);
const someForkSourceOrgsSelected = computed(
  () => forkSourceOrgsSelectedCount.value > 0 && !allForkSourceOrgsSelected.value,
);

// Set indeterminate state on checkboxes
watchEffect(() => {
  if (myOrgsCheckbox.value) {
    myOrgsCheckbox.value.indeterminate = someMyOrgsSelected.value;
  }
});

watchEffect(() => {
  if (contributingOrgsCheckbox.value) {
    contributingOrgsCheckbox.value.indeterminate = someContributingOrgsSelected.value;
  }
});

watchEffect(() => {
  if (forkSourceOrgsCheckbox.value) {
    forkSourceOrgsCheckbox.value.indeterminate = someForkSourceOrgsSelected.value;
  }
});

// Toggle functions: if not all selected, select all; otherwise deselect all
function toggleAllMyOrgs() {
  const newValue = !allMyOrgsSelected.value;
  props.myOrgs.forEach((org) => {
    localFilters.value.enabledOrgs[org] = newValue;
  });
  handleChange();
}

function toggleAllContributingOrgs() {
  const newValue = !allContributingOrgsSelected.value;
  props.contributingOrgs.forEach((org) => {
    localFilters.value.enabledOrgs[org] = newValue;
  });
  handleChange();
}

function toggleAllForkSourceOrgs() {
  const newValue = !allForkSourceOrgsSelected.value;
  props.forkSourceOrgs.forEach((org) => {
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

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  font-style: italic;
}

.org-columns {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 16px;
}

.org-column {
  width: calc(33.333% - 11px);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 700px) {
  .org-columns {
    flex-direction: column;
  }

  .org-column {
    width: 100%;
  }
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
