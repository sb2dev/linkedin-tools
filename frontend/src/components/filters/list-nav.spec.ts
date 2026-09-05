/** Keyboard navigation shared by the filter lists: wrap at both ends, dismiss on an outside click. */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { nextIndex, useDismissOnOutsidePointer } from './list-nav';

describe('nextIndex', () => {
  it('moves down and wraps at the bottom', () => {
    expect(nextIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(nextIndex(2, 'ArrowDown', 3)).toBe(0);
  });

  it('moves up and wraps at the top', () => {
    expect(nextIndex(2, 'ArrowUp', 3)).toBe(1);
    expect(nextIndex(0, 'ArrowUp', 3)).toBe(2);
  });

  it('cycles a single-row list back onto itself', () => {
    // The callers guard on an empty list, so a count of one is the smallest case this sees.
    expect(nextIndex(0, 'ArrowDown', 1)).toBe(0);
    expect(nextIndex(0, 'ArrowUp', 1)).toBe(0);
  });
});

describe('useDismissOnOutsidePointer', () => {
  function setUp(withTrigger: boolean) {
    const panel = document.createElement('div');
    const trigger = document.createElement('button');
    const outside = document.createElement('div');
    document.body.append(panel, trigger, outside);

    const panelRef = createRef<HTMLElement>();
    const triggerRef = createRef<HTMLElement>();
    // The refs are populated by hand, as the components do at runtime.
    panelRef.current = panel;
    triggerRef.current = trigger;

    const onDismiss = vi.fn();
    renderHook(() =>
      useDismissOnOutsidePointer(panelRef, withTrigger ? triggerRef : undefined, onDismiss),
    );

    return { panel, trigger, outside, onDismiss, cleanUp: () => [panel, trigger, outside].forEach((n) => n.remove()) };
  }

  it('dismisses on a pointer outside both the panel and its trigger', () => {
    const { outside, onDismiss, cleanUp } = setUp(true);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).toHaveBeenCalled();
    cleanUp();
  });

  it('ignores a pointer inside the panel', () => {
    const { panel, onDismiss, cleanUp } = setUp(true);

    panel.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
    cleanUp();
  });

  it('ignores a pointer on the trigger, which does its own toggling', () => {
    const { trigger, onDismiss, cleanUp } = setUp(true);

    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
    cleanUp();
  });

  it('dismisses on the trigger too when no trigger was given', () => {
    const { trigger, onDismiss, cleanUp } = setUp(false);

    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).toHaveBeenCalled();
    cleanUp();
  });
});
