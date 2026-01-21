<template>
  <div class="tag-input-container">
    <div class="tags-wrapper" :class="{ focused: isFocused }" @click="focusInput">
      <div v-for="(tag, index) in modelValue" :key="index" class="tag">
        <span class="tag-text">{{ tag }}</span>
        <button class="tag-remove" type="button" aria-label="Remove" @click.stop="removeTag(index)">
          ×
        </button>
      </div>
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        class="tag-input"
        :placeholder="modelValue.length === 0 ? placeholder : ''"
        @keydown="handleKeyDown"
        @blur="handleBlur"
        @focus="isFocused = true"
      />
    </div>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

interface Props {
  modelValue: string[];
  placeholder?: string;
  hint?: string;
  separators?: string[];
}

interface Emits {
  (e: 'update:modelValue', value: string[]): void;
  (e: 'change'): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Type a value and press Enter...',
  hint: '',
  separators: () => [',', ' '],
});

const emit = defineEmits<Emits>();

const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);

function addTag(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;

  // Avoid duplicates
  if (props.modelValue.includes(trimmed)) {
    inputValue.value = '';
    return;
  }

  const newTags = [...props.modelValue, trimmed];
  emit('update:modelValue', newTags);
  emit('change');
  inputValue.value = '';
}

function removeTag(index: number) {
  const newTags = props.modelValue.filter((_, i) => i !== index);
  emit('update:modelValue', newTags);
  emit('change');
  void nextTick(() => {
    inputRef.value?.focus();
  });
}

function handleKeyDown(event: KeyboardEvent) {
  const value = inputValue.value;

  // Enter key
  if (event.key === 'Enter') {
    event.preventDefault();
    addTag(value);
    return;
  }

  // Check if the last character triggers a separator
  const separatorMatch = props.separators.some((sep) => event.key === sep);
  if (separatorMatch && value.trim()) {
    event.preventDefault();
    addTag(value);
    return;
  }

  // Backspace on empty input - remove last tag
  if (event.key === 'Backspace' && !value && props.modelValue.length > 0) {
    event.preventDefault();
    removeTag(props.modelValue.length - 1);
  }
}

function handleBlur() {
  isFocused.value = false;
  // Add any remaining input as a tag on blur
  if (inputValue.value.trim()) {
    addTag(inputValue.value);
  }
}

function focusInput() {
  inputRef.value?.focus();
}
</script>

<style scoped>
.tag-input-container {
  width: 100%;
}

.tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: text;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.tags-wrapper.focused {
  border-color: var(--link-color);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 8px;
  background: #ddf4ff;
  color: #0969da;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  white-space: nowrap;
}

@media (prefers-color-scheme: dark) {
  .tag {
    background: rgba(56, 139, 253, 0.15);
    color: #79c0ff;
  }
}

.tag-text {
  user-select: none;
}

.tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #0969da;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background 0.1s ease;
}

.tag-remove:hover {
  background: rgba(9, 105, 218, 0.15);
}

@media (prefers-color-scheme: dark) {
  .tag-remove {
    color: #79c0ff;
  }

  .tag-remove:hover {
    background: rgba(121, 192, 255, 0.15);
  }
}

.tag-input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary);
  padding: 2px 4px;
}

.tag-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 0;
}
</style>
