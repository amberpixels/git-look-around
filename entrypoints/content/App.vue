<template>
  <CommandPalette ref="commandPaletteRef" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import CommandPalette from './components/CommandPalette.vue';

const commandPaletteRef = ref<InstanceType<typeof CommandPalette> | null>(null);

/**
 * Toggle the command palette visibility
 * Called by parent (index.ts) when hotkey is pressed
 */
function toggle() {
  commandPaletteRef.value?.toggle();
}

// Expose toggle method to parent
defineExpose({
  toggle,
});
</script>
