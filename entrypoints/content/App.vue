<template>
  <CommandPalette ref="commandPaletteRef" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import CommandPalette from './components/CommandPalette.vue';
import type { SearchResultItem } from '@/src/composables/useUnifiedSearch';

const commandPaletteRef = ref<InstanceType<typeof CommandPalette> | null>(null);

/**
 * Toggle the command palette visibility
 * Called by parent (index.ts) when hotkey is pressed
 */
function toggle() {
  commandPaletteRef.value?.toggle();
}

/**
 * Handle cache update from background script
 * Called when background finishes updating cache with fresh results
 */
function handleCacheUpdate(results: SearchResultItem[]) {
  commandPaletteRef.value?.handleCacheUpdate(results);
}

// Expose methods to parent
defineExpose({
  toggle,
  handleCacheUpdate,
});
</script>
