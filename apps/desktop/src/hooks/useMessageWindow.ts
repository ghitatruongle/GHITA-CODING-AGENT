// ==============================================================================
// v0.4.9 B4: Message list windowing (chat virtualization)
//
// Chat transcripts can grow to thousands of messages; rendering them all makes
// ChatPanel sluggish. This module provides pure windowing logic (easily tested)
// plus a thin React hook so the panel can render only a bounded slice of the
// list with a "load older" affordance.
// ==============================================================================

import { useMemo, useState, useCallback } from 'react';

export interface MessageWindow {
  /** Inclusive start index into the full message array. */
  startIndex: number;
  /** Exclusive end index into the full message array. */
  endIndex: number;
  /** True when messages exist before `startIndex` (older, not rendered). */
  hasOlder: boolean;
  /** Count of messages hidden above the window. */
  hiddenAbove: number;
}

export interface WindowOptions {
  /** Max messages rendered at once. Default 200. */
  maxRendered?: number;
  /** How many extra older "pages" the user has revealed. Default 0. */
  revealedPages?: number;
  /** Messages revealed per "load older" action. Default = maxRendered. */
  pageSize?: number;
}

/**
 * Compute the tail window of a message list: by default the most recent
 * `maxRendered` messages are shown; each revealed page extends the window
 * further back. Pure and deterministic for easy testing.
 */
export function computeMessageWindow(total: number, options: WindowOptions = {}): MessageWindow {
  const maxRendered = Math.max(1, options.maxRendered ?? 200);
  const revealedPages = Math.max(0, options.revealedPages ?? 0);
  const pageSize = Math.max(1, options.pageSize ?? maxRendered);

  if (total <= maxRendered) {
    return { startIndex: 0, endIndex: total, hasOlder: false, hiddenAbove: 0 };
  }

  const windowSize = maxRendered + revealedPages * pageSize;
  const startIndex = Math.max(0, total - windowSize);
  return {
    startIndex,
    endIndex: total,
    hasOlder: startIndex > 0,
    hiddenAbove: startIndex,
  };
}

/**
 * React hook wrapping computeMessageWindow with "load older" state.
 * Returns the visible slice of `items` plus controls.
 */
export function useMessageWindow<T>(
  items: readonly T[],
  options: WindowOptions = {},
): {
  visible: T[];
  window: MessageWindow;
  loadOlder: () => void;
  reset: () => void;
} {
  const [revealedPages, setRevealedPages] = useState(0);

  const windowResult = useMemo(
    () => computeMessageWindow(items.length, { ...options, revealedPages }),
    [items.length, options, revealedPages],
  );

  const visible = useMemo(
    () => items.slice(windowResult.startIndex, windowResult.endIndex),
    [items, windowResult.startIndex, windowResult.endIndex],
  );

  const loadOlder = useCallback(() => setRevealedPages((p) => p + 1), []);
  const reset = useCallback(() => setRevealedPages(0), []);

  return { visible: visible as T[], window: windowResult, loadOlder, reset };
}
