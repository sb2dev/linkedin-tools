import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Wraps at both ends, so the cursor cycles rather than stopping at the edges. Needs count > 0. */
export function nextIndex(current: number, key: 'ArrowDown' | 'ArrowUp', count: number): number {
  const step = key === 'ArrowDown' ? 1 : count - 1;
  return (current + step) % count;
}

/** Keeps the keyboard cursor inside the scroll viewport of an option list. */
export function useOptionScroll(listRef: RefObject<HTMLElement | null>, activeIndex: number): void {
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [listRef, activeIndex]);
}

/** A pointerdown outside both the panel and its trigger dismisses; clicking the trigger is its own toggle. */
export function useDismissOnOutsidePointer(
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null> | undefined,
  onDismiss: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) === true) return;
      if (triggerRef?.current?.contains(target) === true) return;
      onDismiss();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [panelRef, triggerRef, onDismiss, enabled]);
}
