// ==============================================================================
// v0.4.9 A7: GUI-Agent Grounding & Retry
//
// Two-step grounding for GUI actions: LOCATE (derive a target point) then
// VERIFY (bounds/sanity check before we actually click). Plus a small retry
// policy and step-annotation helper for the ReAct history.
// ==============================================================================

import type { ScreenSize } from '../index.js';

export interface Point {
  x: number;
  y: number;
}

export interface GroundingResult {
  /** Whether the target is safe to act on. */
  valid: boolean;
  /** The point clamped to screen bounds (only when a size is known). */
  point: Point;
  /** Why the target was rejected (when invalid). */
  reason?: string;
  /** True when the original point was outside bounds and had to be clamped. */
  clamped: boolean;
}

/**
 * VERIFY step: validate a located point before dispatching a click/move.
 * Rejects non-finite coordinates; clamps in-screen when a size is known.
 */
export function verifyCoordinate(point: Point | undefined, size?: ScreenSize): GroundingResult {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return { valid: false, point: { x: 0, y: 0 }, reason: 'non-finite coordinate', clamped: false };
  }
  if (!size || size.width <= 0 || size.height <= 0) {
    // No size context: accept as-is (cannot verify bounds).
    return { valid: true, point, clamped: false };
  }
  const clampedX = Math.min(Math.max(point.x, 0), size.width - 1);
  const clampedY = Math.min(Math.max(point.y, 0), size.height - 1);
  const clamped = clampedX !== point.x || clampedY !== point.y;
  return {
    valid: true,
    point: { x: clampedX, y: clampedY },
    clamped,
    reason: clamped ? 'coordinate outside screen bounds — clamped' : undefined,
  };
}

export interface RetryOptions {
  /** Max attempts (>=1). Default 2. */
  retries?: number;
  /** Delay between attempts in ms. Default 0. */
  delayMs?: number;
  /** Decide whether an error is retryable. Default: always retry. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Sleep function (injectable for tests). */
  sleep?: (ms: number) => Promise<void>;
}

export interface RetryOutcome<T> {
  success: boolean;
  value?: T;
  error?: unknown;
  attempts: number;
}

/**
 * Run an action with a bounded retry policy. Returns an outcome describing how
 * many attempts were made rather than throwing, so the ReAct loop can record
 * accurate step telemetry.
 */
export async function withActionRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryOutcome<T>> {
  const retries = Math.max(1, options.retries ?? 2);
  const delayMs = options.delayMs ?? 0;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 1; attempt <= retries; attempt++) {
    attempts = attempt;
    try {
      const value = await fn();
      return { success: true, value, attempts };
    } catch (error) {
      lastError = error;
      if (attempt < retries && shouldRetry(error, attempt)) {
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }
      break;
    }
  }
  return { success: false, error: lastError, attempts };
}

/** A concise, reader-safe annotation of a GUI action for the history log. */
export interface StepAnnotation {
  label: string;
  point?: Point;
}

/**
 * Produce a short annotation for a dispatched action, e.g. `click @ (120,240)`.
 * Used to enrich ReAct history images/steps without leaking raw model output.
 */
export function annotateAction(actionType: string, point?: Point): StepAnnotation {
  const label = point
    ? `${actionType} @ (${Math.round(point.x)},${Math.round(point.y)})`
    : actionType;
  return { label, point };
}
