// ==============================================================================
// v0.4.9 A7: GUI Grounding & Retry Unit Tests
// ==============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  verifyCoordinate,
  withActionRetry,
  annotateAction,
} from '../src/operators/grounding.js';

describe('verifyCoordinate (locate → verify)', () => {
  it('rejects non-finite coordinates', () => {
    expect(verifyCoordinate({ x: NaN, y: 10 }).valid).toBe(false);
    expect(verifyCoordinate(undefined).valid).toBe(false);
  });

  it('accepts a coordinate as-is when no screen size is known', () => {
    const r = verifyCoordinate({ x: 5000, y: 9000 });
    expect(r.valid).toBe(true);
    expect(r.clamped).toBe(false);
    expect(r.point).toEqual({ x: 5000, y: 9000 });
  });

  it('clamps a coordinate outside screen bounds', () => {
    const r = verifyCoordinate({ x: 5000, y: -3 }, { width: 1920, height: 1080 });
    expect(r.valid).toBe(true);
    expect(r.clamped).toBe(true);
    expect(r.point).toEqual({ x: 1919, y: 0 });
    expect(r.reason).toMatch(/clamped/);
  });

  it('leaves an in-bounds coordinate unchanged', () => {
    const r = verifyCoordinate({ x: 100, y: 200 }, { width: 1920, height: 1080 });
    expect(r.clamped).toBe(false);
    expect(r.point).toEqual({ x: 100, y: 200 });
  });
});

describe('withActionRetry', () => {
  it('returns success on the first attempt', async () => {
    const fn = vi.fn(async () => 'ok');
    const outcome = await withActionRetry(fn, { retries: 3 });
    expect(outcome.success).toBe(true);
    expect(outcome.value).toBe('ok');
    expect(outcome.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries then succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'done';
    });
    const outcome = await withActionRetry(fn, { retries: 3, sleep: async () => {} });
    expect(outcome.success).toBe(true);
    expect(outcome.attempts).toBe(3);
  });

  it('gives up after exhausting retries', async () => {
    const fn = vi.fn(async () => {
      throw new Error('always fails');
    });
    const outcome = await withActionRetry(fn, { retries: 2, sleep: async () => {} });
    expect(outcome.success).toBe(false);
    expect(outcome.attempts).toBe(2);
    expect((outcome.error as Error).message).toBe('always fails');
  });

  it('stops early when shouldRetry returns false', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fatal');
    });
    const outcome = await withActionRetry(fn, { retries: 5, shouldRetry: () => false });
    expect(outcome.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('annotateAction', () => {
  it('includes the point when provided', () => {
    expect(annotateAction('click', { x: 120.4, y: 240.6 }).label).toBe('click @ (120,241)');
  });
  it('omits the point when not provided', () => {
    expect(annotateAction('type').label).toBe('type');
  });
});
