import { onMounted, onUnmounted } from 'vue';
import { debugLogSync } from '@/src/utils/debug';

export interface KeyboardActions {
  moveNext: () => void;
  movePrev: () => void;
  select: (newTab: boolean) => void;
  dismiss: () => void;
  focusInput: () => void;
  onType: (char: string) => void;
  tab: () => void;
  enterFocusedMode: () => void;
  exitFocusedMode: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardActions, isVisible: () => boolean) {
  function handleKeydown(e: KeyboardEvent) {
    // CRITICAL: Only handle keyboard events when the palette is visible
    if (!isVisible()) {
      return;
    }

    debugLogSync('[Git Look Around] Composable: handleKeydown', e.key);

    // Check if user is typing in an input field, textarea, or contenteditable element
    const target = e.target as HTMLElement;
    const isTypingInField =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // If user is typing in a field, only allow specific navigation keys and Escape
    if (isTypingInField) {
      const allowedKeys = [
        'Escape',
        'ArrowUp',
        'ArrowDown',
        'ArrowRight',
        'ArrowLeft',
        'Enter',
        'Tab',
      ];
      if (!allowedKeys.includes(e.key)) {
        return;
      }
    }

    if (e.key === 'Escape') {
      debugLogSync('[Git Look Around] Shortcut: Escape');
      // Always prevent default and stop propagation for Escape to avoid conflicts
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      actions.dismiss();
      return;
    }

    if (e.key === 'ArrowDown') {
      debugLogSync('[Git Look Around] Shortcut: ArrowDown');
      e.preventDefault();
      e.stopPropagation();
      actions.moveNext();
      return;
    }

    if (e.key === 'ArrowUp') {
      debugLogSync('[Git Look Around] Shortcut: ArrowUp');
      e.preventDefault();
      e.stopPropagation();
      actions.movePrev();
      return;
    }

    if (e.key === 'ArrowRight') {
      // Only handle if NOT typing in input field OR cursor is at the end
      if (isTypingInField && target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        const cursorAtEnd =
          input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
        if (!cursorAtEnd) {
          return; // Let the input handle cursor navigation
        }
      }
      debugLogSync('[Git Look Around] Shortcut: ArrowRight');
      e.preventDefault();
      e.stopPropagation();
      actions.enterFocusedMode();
      return;
    }

    if (e.key === 'ArrowLeft') {
      // Only handle if NOT typing in input field OR cursor is at the start
      if (isTypingInField && target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        const cursorAtStart = input.selectionStart === 0 && input.selectionEnd === 0;
        if (!cursorAtStart) {
          return; // Let the input handle cursor navigation
        }
      }
      debugLogSync('[Git Look Around] Shortcut: ArrowLeft');
      e.preventDefault();
      e.stopPropagation();
      actions.exitFocusedMode();
      return;
    }

    if (e.key === 'Enter') {
      debugLogSync('[Git Look Around] Shortcut: Enter');
      e.preventDefault();
      e.stopPropagation();
      const newTab = e.metaKey || e.ctrlKey;
      actions.select(newTab);
      return;
    }

    if (e.key === 'Tab') {
      debugLogSync('[Git Look Around] Shortcut: Tab');
      e.preventDefault();
      e.stopPropagation();
      actions.tab();
      return;
    }

    // Typing handling (only if no modifiers and not in a field)
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingInField) {
      debugLogSync('[Git Look Around] Shortcut: Typing', e.key);
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
