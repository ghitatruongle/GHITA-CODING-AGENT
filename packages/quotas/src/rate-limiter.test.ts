// ==============================================================================
// GHITA CODING AGENT - Rate Limiter Tests
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it('should allow requests within limit', () => {
    limiter.registerLimit({ id: 'test', limit: 10, window: 'minute', scope: 'requests' });
    const result = limiter.check('user1', 'test', 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('should block requests over limit', () => {
    limiter.registerLimit({ id: 'test', limit: 2, window: 'minute', scope: 'requests' });
    limiter.check('user1', 'test', 1);
    limiter.check('user1', 'test', 1);
    const result = limiter.check('user1', 'test', 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should allow unlimited requests for unregistered limits', () => {
    const result = limiter.check('user1', 'unknown');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(Infinity);
  });

  it('should peek at remaining tokens without consuming', () => {
    limiter.registerLimit({ id: 'test', limit: 5, window: 'minute', scope: 'requests' });
    expect(limiter.peek('user1', 'test')).toBe(5);
    limiter.check('user1', 'test', 2);
    expect(limiter.peek('user1', 'test')).toBe(3);
  });

  it('should reset bucket for a specific limit', () => {
    limiter.registerLimit({ id: 'test', limit: 3, window: 'minute', scope: 'requests' });
    limiter.check('user1', 'test', 3);
    expect(limiter.check('user1', 'test', 1).allowed).toBe(false);
    limiter.reset('user1', 'test');
    expect(limiter.peek('user1', 'test')).toBe(3);
  });

  it('should reset all buckets for a user', () => {
    limiter.registerLimit({ id: 'api1', limit: 3, window: 'minute', scope: 'requests' });
    limiter.registerLimit({ id: 'api2', limit: 3, window: 'minute', scope: 'requests' });
    limiter.check('user1', 'api1', 3);
    limiter.check('user1', 'api2', 3);
    limiter.reset('user1');
    expect(limiter.peek('user1', 'api1')).toBe(3);
    expect(limiter.peek('user1', 'api2')).toBe(3);
  });

  it('should report stats', () => {
    limiter.registerLimit({ id: 'test', limit: 2, window: 'minute', scope: 'requests' });
    limiter.check('user1', 'test', 1);
    limiter.check('user1', 'test', 1);
    limiter.check('user1', 'test', 1); // blocked
    const stats = limiter.stats();
    expect(stats.totalChecks).toBe(3);
    expect(stats.totalBlocked).toBe(1);
    expect(stats.registeredLimits).toBe(1);
    expect(stats.uniqueUsers).toBe(1);
  });

  it('should unregister a limit', () => {
    limiter.registerLimit({ id: 'test', limit: 1, window: 'minute', scope: 'requests' });
    limiter.unregisterLimit('test');
    const result = limiter.check('user1', 'test');
    expect(result.allowed).toBe(true);
  });

  it('should clear all buckets', () => {
    limiter.registerLimit({ id: 'test', limit: 1, window: 'minute', scope: 'requests' });
    limiter.check('user1', 'test');
    limiter.clear();
    expect(limiter.stats().totalChecks).toBe(0);
  });

  it('should handle multiple users independently', () => {
    limiter.registerLimit({ id: 'test', limit: 1, window: 'minute', scope: 'requests' });
    expect(limiter.check('user1', 'test', 1).allowed).toBe(true);
    expect(limiter.check('user2', 'test', 1).allowed).toBe(true);
    expect(limiter.check('user1', 'test', 1).allowed).toBe(false);
    expect(limiter.check('user2', 'test', 1).allowed).toBe(false);
  });
});
