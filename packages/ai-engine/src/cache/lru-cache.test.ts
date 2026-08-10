import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LRUCache } from './lru-cache.js';

describe('LRUCache basics', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache({ maxSize: 100 });
  });

  it('sets and gets values', () => {
    cache.set('a', 'value-a');
    expect(cache.get('a')).toBe('value-a');
    expect(cache.get('missing')).toBeNull();
  });

  it('has() and delete()', () => {
    cache.set('a', 'x');
    expect(cache.has('a')).toBe(true);
    expect(cache.delete('a')).toBe(true);
    expect(cache.has('a')).toBe(false);
  });

  it('expires entries with TTL', () => {
    vi.useFakeTimers();
    cache.set('a', 'x', { ttl: 100 });
    expect(cache.get('a')).toBe('x');
    vi.advanceTimersByTime(150);
    expect(cache.get('a')).toBeNull();
    vi.useRealTimers();
  });

  it('evicts LRU when maxSize exceeded', () => {
    const small = new LRUCache<string>({ maxSize: 2 });
    small.set('a', '1');
    small.set('b', '2');
    small.set('c', '3'); // evicts 'a' (LRU)
    expect(small.has('a')).toBe(false);
    expect(small.has('b')).toBe(true);
    expect(small.has('c')).toBe(true);
  });

  it('clear() empties the cache', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
  });

  it('supports tags and invalidation', () => {
    cache.set('a', '1', { tags: ['t1'] });
    cache.set('b', '2', { tags: ['t2'] });
    const removed = cache.invalidateByTag('t1');
    expect(removed).toContain('a');
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
  });

  it('setMany/getMany round-trip', () => {
    cache.setMany([
      { key: 'k1', value: 'v1' },
      { key: 'k2', value: 'v2' },
    ]);
    const got = cache.getMany(['k1', 'k2']);
    expect(got.get('k1')).toBe('v1');
    expect(got.get('k2')).toBe('v2');
  });
});

describe('LRUCache byte budget (v1.1.0 Track 9 B3)', () => {
  it('evicts by maxMemoryBytes and tracks memoryBytes()', () => {
    const cache = new LRUCache<string>({ maxSize: 100, maxMemoryBytes: 200 });
    cache.set('a', 'x'.repeat(100));
    cache.set('b', 'x'.repeat(100));
    // Cả hai entry ~200*2 bytes → vượt cap 200 → evict a.
    expect(cache.has('a')).toBe(false);
    expect(cache.memoryBytes()).toBeLessThanOrEqual(200);
    cache.clear();
    expect(cache.memoryBytes()).toBe(0);
  });

  it('replaces entries and keeps bytes consistent', () => {
    const cache = new LRUCache<string>({ maxSize: 10, maxMemoryBytes: 0 });
    cache.set('k', 'y'.repeat(50));
    const before = cache.memoryBytes();
    cache.set('k', 'z'.repeat(80));
    expect(cache.memoryBytes()).toBeGreaterThan(before);
  });

  it('delete() releases bytes', () => {
    const cache = new LRUCache<string>({ maxSize: 10, maxMemoryBytes: 0 });
    cache.set('k', 'x'.repeat(100));
    const before = cache.memoryBytes();
    cache.delete('k');
    expect(cache.memoryBytes()).toBeLessThan(before);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
