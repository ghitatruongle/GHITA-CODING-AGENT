// @vitest-environment happy-dom

// v0.4.9 B4: Message Windowing Unit Tests

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { computeMessageWindow, useMessageWindow } from './useMessageWindow.js';

describe('computeMessageWindow', () => {
  it('renders everything when under the cap', () => {
    const w = computeMessageWindow(50, { maxRendered: 200 });
    expect(w).toEqual({ startIndex: 0, endIndex: 50, hasOlder: false, hiddenAbove: 0 });
  });

  it('windows to the tail when over the cap', () => {
    const w = computeMessageWindow(1000, { maxRendered: 200 });
    expect(w.startIndex).toBe(800);
    expect(w.endIndex).toBe(1000);
    expect(w.hasOlder).toBe(true);
    expect(w.hiddenAbove).toBe(800);
  });

  it('extends the window when older pages are revealed', () => {
    const w = computeMessageWindow(1000, { maxRendered: 200, revealedPages: 2, pageSize: 100 });
    // window size = 200 + 2*100 = 400 → start at 600
    expect(w.startIndex).toBe(600);
  });

  it('never starts below zero', () => {
    const w = computeMessageWindow(300, { maxRendered: 200, revealedPages: 10, pageSize: 100 });
    expect(w.startIndex).toBe(0);
    expect(w.hasOlder).toBe(false);
  });
});

describe('useMessageWindow', () => {
  it('returns the tail slice and reveals older on demand', () => {
    const items = Array.from({ length: 500 }, (_, i) => i);
    const { result } = renderHook(() =>
      useMessageWindow(items, { maxRendered: 100, pageSize: 100 }),
    );

    expect(result.current.visible).toHaveLength(100);
    expect(result.current.visible[0]).toBe(400);
    expect(result.current.window.hasOlder).toBe(true);

    act(() => result.current.loadOlder());
    expect(result.current.visible).toHaveLength(200);
    expect(result.current.visible[0]).toBe(300);

    act(() => result.current.reset());
    expect(result.current.visible).toHaveLength(100);
  });

  it('shows all items when under the cap', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const { result } = renderHook(() => useMessageWindow(items, { maxRendered: 100 }));
    expect(result.current.visible).toHaveLength(20);
    expect(result.current.window.hasOlder).toBe(false);
  });
});
