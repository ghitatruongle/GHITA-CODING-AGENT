// ==============================================================================
// GHITA CODING AGENT - ReconnectStrategy Unit Tests (Phase 29)
// 20 test cases covering exponential backoff, jitter, max attempts,
// abort, reset, scheduling, and lifecycle.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconnectStrategy } from '../src/ws/reconnect.js';

describe('ReconnectStrategy', () => {
  let strategy: ReconnectStrategy;

  beforeEach(() => {
    vi.useFakeTimers();
    strategy = new ReconnectStrategy({
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      maxAttempts: 5,
      jitter: 0, // Disable jitter for predictable tests
      resetAfter: 60000,
    });
  });

  afterEach(() => {
    strategy.destroy();
    vi.useRealTimers();
  });

  // ── Group 1: Exponential backoff (5 tests) ─────────────────────────────

  describe('exponential backoff', () => {
    it('1. first delay equals initialDelay', () => {
      const delay = strategy.nextDelay();
      expect(delay).toBe(1000);
    });

    it('2. second delay doubles (backoff multiplier)', () => {
      strategy.nextDelay(); // 1000
      const delay = strategy.nextDelay(); // 2000
      expect(delay).toBe(2000);
    });

    it('3. delay caps at maxDelay', () => {
      for (let i = 0; i < 10; i++) strategy.nextDelay();
      expect(strategy.currentDelay).toBeLessThanOrEqual(30000);
    });

    it('4. delay increases exponentially', () => {
      const delays: number[] = [];
      for (let i = 0; i < 4; i++) delays.push(strategy.nextDelay());
      // 1000, 2000, 4000, 8000
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(8000);
    });

    it('5. attempts counter increments', () => {
      strategy.nextDelay();
      strategy.nextDelay();
      strategy.nextDelay();
      expect(strategy.attempts).toBe(3);
    });
  });

  // ── Group 2: Max attempts (3 tests) ────────────────────────────────────

  describe('max attempts', () => {
    it('6. returns -1 after max attempts exceeded', () => {
      for (let i = 0; i < 5; i++) strategy.nextDelay();
      const delay = strategy.nextDelay();
      expect(delay).toBe(-1);
    });

    it('7. infinite attempts when maxAttempts=0', () => {
      const infinite = new ReconnectStrategy({ maxAttempts: 0, jitter: 0 });
      for (let i = 0; i < 100; i++) {
        expect(infinite.nextDelay()).toBeGreaterThan(0);
      }
      infinite.destroy();
    });

    it('8. disabled reconnect returns -1', () => {
      const disabled = new ReconnectStrategy({ enabled: false });
      expect(disabled.nextDelay()).toBe(-1);
      expect(disabled.enabled).toBe(false);
      disabled.destroy();
    });
  });

  // ── Group 3: Jitter (2 tests) ──────────────────────────────────────────

  describe('jitter', () => {
    it('9. jitter adds randomness to delay', () => {
      const jitterStrategy = new ReconnectStrategy({
        initialDelay: 1000,
        jitter: 0.5,
        maxAttempts: 0,
      });
      const delays: number[] = [];
      for (let i = 0; i < 10; i++) delays.push(jitterStrategy.nextDelay());
      // With 50% jitter on 1000ms base, delays should vary
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
      jitterStrategy.destroy();
    });

    it('10. jitter stays within bounds', () => {
      const jitterStrategy = new ReconnectStrategy({
        initialDelay: 1000,
        jitter: 0.2,
        maxAttempts: 0,
        backoffMultiplier: 1, // no backoff, so jitter is the only variation
      });
      for (let i = 0; i < 20; i++) {
        const delay = jitterStrategy.nextDelay();
        // With 20% jitter and no backoff: base=1000, range=800-1200
        expect(delay).toBeGreaterThanOrEqual(800);
        expect(delay).toBeLessThanOrEqual(1200);
      }
      jitterStrategy.destroy();
    });
  });

  // ── Group 4: Abort / Reset (4 tests) ───────────────────────────────────

  describe('abort and reset', () => {
    it('11. abort prevents further delays', () => {
      strategy.nextDelay();
      strategy.abort();
      expect(strategy.aborted).toBe(true);
      expect(strategy.nextDelay()).toBe(-1);
    });

    it('12. reset clears attempts and abort', () => {
      strategy.nextDelay();
      strategy.nextDelay();
      strategy.abort();
      strategy.reset();
      expect(strategy.attempts).toBe(0);
      expect(strategy.aborted).toBe(false);
      expect(strategy.nextDelay()).toBe(1000); // back to initial
    });

    it('13. onConnected resets attempts', () => {
      strategy.nextDelay();
      strategy.nextDelay();
      strategy.onConnected();
      expect(strategy.attempts).toBe(0);
      expect(strategy.currentDelay).toBe(1000);
    });

    it('14. onConnected records timestamp', () => {
      strategy.onConnected();
      expect(strategy.lastConnectedTime).toBeGreaterThan(0);
    });
  });

  // ── Group 5: Schedule (4 tests) ────────────────────────────────────────

  describe('schedule', () => {
    it('15. schedule returns delay and fires callback', () => {
      let called = false;
      const delay = strategy.schedule(() => {
        called = true;
      });
      expect(delay).toBe(1000);
      vi.advanceTimersByTime(1000);
      expect(called).toBe(true);
    });

    it('16. cancel prevents scheduled callback', () => {
      let called = false;
      strategy.schedule(() => {
        called = true;
      });
      strategy.cancel();
      vi.advanceTimersByTime(5000);
      expect(called).toBe(false);
    });

    it('17. new schedule cancels previous', () => {
      let first = false;
      let second = false;
      strategy.schedule(() => {
        first = true;
      });
      strategy.schedule(() => {
        second = true;
      });
      vi.advanceTimersByTime(3000);
      expect(first).toBe(false);
      expect(second).toBe(true);
    });

    it('18. schedule returns -1 when disabled', () => {
      const disabled = new ReconnectStrategy({ enabled: false });
      const delay = disabled.schedule(() => {});
      expect(delay).toBe(-1);
      disabled.destroy();
    });
  });

  // ── Group 6: Properties (2 tests) ──────────────────────────────────────

  describe('properties', () => {
    it('19. lastAttemptTime updates on nextDelay', () => {
      expect(strategy.lastAttemptTime).toBe(0);
      strategy.nextDelay();
      expect(strategy.lastAttemptTime).toBeGreaterThan(0);
    });

    it('20. destroy cleans up', () => {
      strategy.nextDelay();
      strategy.destroy();
      expect(strategy.aborted).toBe(true);
    });
  });
});
