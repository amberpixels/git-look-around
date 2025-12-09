import { ref, Ref, watch, computed } from 'vue';
import { debugLogSync } from '@/src/utils/debug';

export interface PaletteNavigationOptions<T, S> {
  items: Ref<T[]> | (() => T[]);
  subItems: Ref<S[]> | (() => S[]);
  getItemId: (item: T) => number | string;
  onExpand?: (item: T) => Promise<void> | void;
  onCollapse?: () => void;
  expandedItemId?: Ref<number | string | null>;
}

export function usePaletteNavigation<T, S>(options: PaletteNavigationOptions<T, S>) {
  const { getItemId, onExpand, onCollapse } = options;

  // Normalize items/subItems to computed refs
  const items = computed(() => {
    const val = options.items;
    return typeof val === 'function' ? val() : val.value;
  });

  const subItems = computed(() => {
    const val = options.subItems;
    return typeof val === 'function' ? val() : val.value;
  });

  const focusedIndex = ref(0);
  const detailFocusIndex = ref(0);
  const focusMode = ref<'repos' | 'details'>('repos');
  const expandedItemId = options.expandedItemId || ref<number | string | null>(null);

  function collapse() {
    debugLogSync('[Gitjump] Navigation: collapse');
    expandedItemId.value = null;
    detailFocusIndex.value = 0;
    focusMode.value = 'repos';
    onCollapse?.();
  }

  async function expand() {
    const item = items.value[focusedIndex.value];
    if (!item) return;

    const id = getItemId(item);
    debugLogSync('[Gitjump] Navigation: expand', { id, index: focusedIndex.value });
    expandedItemId.value = id;
    focusMode.value = 'details';
    detailFocusIndex.value = 0;

    if (onExpand) {
      await onExpand(item);
    }

    // If no sub-items after expand (and loading finished), collapse back?
    // This logic was in the component, but maybe we leave it to the component to call collapse() if needed?
    // For now, let's just do the state change.
  }

  function moveNext() {
    if (focusMode.value === 'details' && expandedItemId.value) {
      if (subItems.value.length === 0) {
        collapse();
      } else {
        const newIndex = Math.min(detailFocusIndex.value + 1, subItems.value.length - 1);
        debugLogSync('[Gitjump] Navigation: moveNext (details)', {
          from: detailFocusIndex.value,
          to: newIndex,
        });
        detailFocusIndex.value = newIndex;
      }
      return;
    }

    const maxIndex = items.value.length - 1;
    if (maxIndex < 0) return;
    const newIndex = Math.min(focusedIndex.value + 1, maxIndex);
    debugLogSync('[Gitjump] Navigation: moveNext (repos)', {
      from: focusedIndex.value,
      to: newIndex,
    });
    focusedIndex.value = newIndex;
  }

  function movePrev() {
    if (focusMode.value === 'details' && expandedItemId.value) {
      if (subItems.value.length === 0) {
        collapse();
      } else {
        const newIndex = Math.max(detailFocusIndex.value - 1, 0);
        debugLogSync('[Gitjump] Navigation: movePrev (details)', {
          from: detailFocusIndex.value,
          to: newIndex,
        });
        detailFocusIndex.value = newIndex;
      }
      return;
    }

    const newIndex = Math.max(focusedIndex.value - 1, 0);
    debugLogSync('[Gitjump] Navigation: movePrev (repos)', {
      from: focusedIndex.value,
      to: newIndex,
    });
    focusedIndex.value = newIndex;
  }

  // Watchers to ensure safety
  watch(subItems, (newItems) => {
    if (focusMode.value !== 'details') return;
    if (newItems.length === 0) {
      // If subitems disappear, we might want to collapse or just reset index
      // The original component logic:
      // if (items.length === 0) { detailFocusIndex.value = 0; return; }
      detailFocusIndex.value = 0;
      return;
    }
    if (detailFocusIndex.value >= newItems.length) {
      detailFocusIndex.value = newItems.length - 1;
    }
  });

  watch(items, () => {
    if (!expandedItemId.value) return;
    const stillVisible = items.value.some((item) => getItemId(item) === expandedItemId.value);
    if (!stillVisible) {
      collapse();
    }
  });

  return {
    focusedIndex,
    detailFocusIndex,
    focusMode,
    expandedItemId,
    moveNext,
    movePrev,
    expand,
    collapse,
  };
}
