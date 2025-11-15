<template>
  <div v-if="isVisible" class="gitjump-overlay" @click="handleBackdropClick">
    <div class="gitjump-popup">
      <h2>Hello Github</h2>
      <button class="btn btn-primary">GitHub Button</button>
      <span class="Label Label--success">Success Label</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isVisible = ref(false);

function show() {
  isVisible.value = true;
}

function hide() {
  isVisible.value = false;
}

function toggle() {
  isVisible.value = !isVisible.value;
}

function handleBackdropClick(e: MouseEvent) {
  // Only close if clicking the backdrop, not the popup itself
  if (e.target === e.currentTarget) {
    hide();
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isVisible.value) {
    hide();
  }
}

// Listen for Escape key globally
document.addEventListener('keydown', handleKeydown);

// Expose methods so parent can call them
defineExpose({
  show,
  hide,
  toggle,
});
</script>

<style scoped>
.gitjump-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
}

.gitjump-popup {
  background: white;
  padding: 40px;
  border-radius: 8px;
  font-size: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
</style>
