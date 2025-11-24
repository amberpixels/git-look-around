import { onMounted, onUnmounted } from 'vue';

export interface KeyboardActions {
  moveNext: () => void;
  movePrev: () => void;
  expand: () => void;
  collapse: () => void;
  select: (newTab: boolean) => void;
  dismiss: () => void;
  focusInput: () => void;
  onType: (char: string) => void;
}

export function useKeyboardShortcuts(actions: KeyboardActions, isVisible: () => boolean) {
  function handleKeydown(e: KeyboardEvent) {
    // CRITICAL: Only handle keyboard events when the palette is visible
    if (!isVisible()) {
      return;
    }

    console.log('[Gitjump] Composable: handleKeydown', e.key);

    // Check if user is typing in an input field, textarea, or contenteditable element
    const target = e.target as HTMLElement;
    const isTypingInField =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // If user is typing in a field, only allow Escape to close the palette
    if (isTypingInField && e.key !== 'Escape') {
      return;
    }

    if (e.key === 'Escape') {
      console.log('[Gitjump] Shortcut: Escape');
      // Always prevent default and stop propagation for Escape to avoid conflicts
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      actions.dismiss();
      return;
    }

    if (e.key === 'ArrowDown') {
      console.log('[Gitjump] Shortcut: ArrowDown');
      e.preventDefault();
      e.stopPropagation();
      actions.moveNext();
      return;
    }

    if (e.key === 'ArrowUp') {
      console.log('[Gitjump] Shortcut: ArrowUp');
      e.preventDefault();
      e.stopPropagation();
      actions.movePrev();
      return;
    }

    if (e.key === 'ArrowRight') {
      console.log('[Gitjump] Shortcut: ArrowRight');
      e.preventDefault();
      e.stopPropagation();
      actions.expand();
      return;
    }

    if (e.key === 'ArrowLeft') {
      console.log('[Gitjump] Shortcut: ArrowLeft');
      e.preventDefault();
      e.stopPropagation();
      actions.collapse();
      return;
    }

    if (e.key === 'Enter') {
      console.log('[Gitjump] Shortcut: Enter');
      e.preventDefault();
      e.stopPropagation();
      const newTab = e.metaKey || e.ctrlKey;
      actions.select(newTab);
      return;
    }

    // Typing handling (only if no modifiers and not in a field)
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingInField) {
      console.log('[Gitjump] Shortcut: Typing', e.key);
      e.preventDefault();
      e.stopPropagation();
      actions.focusInput();
      actions.onType(e.key);
    }
  }

  onMounted(() => {
    // Use capture phase to ensure we get the event before anyone else
    window.addEventListener('keydown', handleKeydown, { capture: true });
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown, { capture: true });
  });

  return {
    handleKeydown,
  };
}
