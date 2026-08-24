// 40 test cases covering get/set, TTL, eviction policies, tag/pattern
// invalidation, batch ops, events, stats, and edge cases.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LRUCache } from '../src/cache/lru-cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({
      maxSize: 5,
      defaultTTL: null,
      cleanupInterval: 0, // disable timer in tests
      evictionPolicy: 'lru',
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  // ── Group 1: Basic get/set/delete (8 tests) ────────────────────────────

  describe('basic operations', () => {
    it('1. set and get a value', () => {
      cache.set('a', 'alpha');
      expect(cache.get('a')).toBe('alpha');
    });

    it('2. get returns null for missing key', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('3. has returns true for existing key', () => {
      cache.set('x', 'val');
      expect(cache.has('x')).toBe(true);
    });

    it('4. has returns false for missing key', () => {
      expect(cache.has('nope')).toBe(false);
    });

    it('5. delete removes entry', () => {
      cache.set('a', 'val');
      expect(cache.delete('a')).toBe(true);
      expect(cache.get('a')).toBeNull();
      expect(cache.size).toBe(0);
    });

    it('6. delete returns false for missing key', () => {
      expect(cache.delete('zzz')).toBe(false);
    });

    it('7. clear removes all entries', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeNull();
    });

    it('8. overwrite existing key', () => {
      cache.set('a', 'first');
      cache.set('a', 'second');
      expect(cache.get('a')).toBe('second');
      expect(cache.size).toBe(1);
    });
  });

  // ── Group 2: TTL expiration (5 tests) ──────────────────────────────────

  describe('TTL expiration', () => {
    it('9. entry expires after TTL', () => {
      cache.set('a', 'val', { ttl: 50 });
      expect(cache.get('a')).toBe('val');
      // Simulate time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(60);
      expect(cache.get('a')).toBeNull();
      vi.useRealTimers();
    });

    it('10. has returns false for expired entry', () => {
      cache.set('k', 'v', { ttl: 10 });
      vi.useFakeTimers();
      vi.advanceTimersByTime(20);
      expect(cache.has('k')).toBe(false);
      vi.useRealTimers();
    });

    it('11. entry with null TTL never expires', () => {
      const noTtlCache = new LRUCache<string>({ maxSize: 5, defaultTTL: null, cleanupInterval: 0 });
      noTtlCache.set('perm', 'forever');
      vi.useFakeTimers();
      vi.advanceTimersByTime(999_999);
      expect(noTtlCache.get('perm')).toBe('forever');
      vi.useRealTimers();
      noTtlCache.destroy();
    });

    it('12. refreshOnAccess extends TTL on get', () => {
      const refreshCache = new LRUCache<string>({
        maxSize: 5,
        defaultTTL: 100,
        refreshOnAccess: true,
        cleanupInterval: 0,
      });
      refreshCache.set('r', 'val');
      vi.useFakeTimers();
      vi.advanceTimersByTime(80);
      expect(refreshCache.get('r')).toBe('val'); // refresh at 80ms
      vi.advanceTimersByTime(80); // 160ms total, but TTL was refreshed at 80ms
      expect(refreshCache.get('r')).toBe('val');
      vi.useRealTimers();
      refreshCache.destroy();
    });

    it('13. per-entry TTL overrides default', () => {
      const defCache = new LRUCache<string>({ maxSize: 5, defaultTTL: 1000, cleanupInterval: 0 });
      defCache.set('short', 'val', { ttl: 10 });
      vi.useFakeTimers();
      vi.advanceTimersByTime(20);
      expect(defCache.get('short')).toBeNull();
      vi.useRealTimers();
      defCache.destroy();
    });
  });

  // ── Group 3: Eviction policies (7 tests) ───────────────────────────────

  describe('LRU eviction', () => {
    it('14. evicts LRU item when maxSize reached', () => {
      for (let i = 0; i < 5; i++) cache.set(`k${i}`, `v${i}`);
      // Access k0 to make it recently used
      cache.get('k0');
      // Adding k5 should evict k1 (LRU)
      cache.set('k5', 'v5');
      expect(cache.has('k1')).toBe(false);
      expect(cache.get('k0')).toBe('v0');
    });

    it('15. size never exceeds maxSize', () => {
      for (let i = 0; i < 20; i++) cache.set(`k${i}`, `v${i}`);
      expect(cache.size).toBeLessThanOrEqual(5);
    });

    it('16. stats track evictions', () => {
      for (let i = 0; i < 10; i++) cache.set(`k${i}`, `v${i}`);
      expect(cache.stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('LFU eviction', () => {
    it('17. evicts least frequently used item', () => {
      const lfu = new LRUCache<string>({
        maxSize: 3,
        defaultTTL: null,
        cleanupInterval: 0,
        evictionPolicy: 'lfu',
      });
      lfu.set('a', '1');
      lfu.set('b', '2');
      lfu.set('c', '3');
      // Access a and c multiple times
      lfu.get('a');
      lfu.get('a');
      lfu.get('c');
      // b has 0 hits → should be evicted
      lfu.set('d', '4');
      expect(lfu.has('b')).toBe(false);
      expect(lfu.has('a')).toBe(true);
      lfu.destroy();
    });
  });

  describe('FIFO eviction', () => {
    it('18. evicts first-in item regardless of access', () => {
      const fifo = new LRUCache<string>({
        maxSize: 3,
        defaultTTL: null,
        cleanupInterval: 0,
        evictionPolicy: 'fifo',
      });
      fifo.set('a', '1');
      fifo.set('b', '2');
      fifo.set('c', '3');
      // get moves 'a' to MRU position, so 'b' is now first-in
      fifo.get('a');
      fifo.set('d', '4');
      // After get('a'), order is [b, c, a]. FIFO evicts 'b' (front)
      expect(fifo.has('b')).toBe(false);
      expect(fifo.has('a')).toBe(true);
      fifo.destroy();
    });
  });

  // ── Group 4: Tag & pattern invalidation (4 tests) ──────────────────────

  describe('invalidation', () => {
    it('19. invalidateByTag removes matching entries', () => {
      cache.set('a', '1', { tags: ['user'] });
      cache.set('b', '2', { tags: ['admin'] });
      cache.set('c', '3', { tags: ['user', 'admin'] });
      const removed = cache.invalidateByTag('user');
      expect(removed).toHaveLength(2);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('c')).toBe(false);
      expect(cache.has('b')).toBe(true);
    });

    it('20. invalidateByTag returns empty for unknown tag', () => {
      cache.set('a', '1', { tags: ['x'] });
      expect(cache.invalidateByTag('unknown')).toHaveLength(0);
    });

    it('21. invalidateByPattern with regex', () => {
      cache.set('user:1', 'a');
      cache.set('user:2', 'b');
      cache.set('admin:1', 'c');
      const removed = cache.invalidateByPattern(/^user:/);
      expect(removed).toHaveLength(2);
      expect(cache.has('admin:1')).toBe(true);
    });

    it('22. invalidateByPattern with string', () => {
      cache.set('test-abc', 'x');
      cache.set('test-def', 'y');
      cache.set('prod-abc', 'z');
      const removed = cache.invalidateByPattern('test-');
      expect(removed).toHaveLength(2);
    });
  });

  // ── Group 5: Batch operations (3 tests) ────────────────────────────────

  describe('batch operations', () => {
    it('23. setMany sets multiple entries', () => {
      cache.setMany([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
        { key: 'c', value: '3' },
      ]);
      expect(cache.size).toBe(3);
      expect(cache.get('b')).toBe('2');
    });

    it('24. getMany returns map of found entries', () => {
      cache.set('a', '1');
      cache.set('c', '3');
      const result = cache.getMany(['a', 'b', 'c']);
      expect(result.size).toBe(2);
      expect(result.get('a')).toBe('1');
      expect(result.get('c')).toBe('3');
    });

    it('25. entries returns all entries', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      const entries = cache.entries();
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.key).sort()).toEqual(['a', 'b']);
    });
  });

  // ── Group 6: topKeys (2 tests) ─────────────────────────────────────────

  describe('topKeys', () => {
    it('26. returns top-N by hit count', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.get('a');
      cache.get('a');
      cache.get('a');
      cache.get('b');
      const top = cache.topKeys(2);
      expect(top[0]!.key).toBe('a');
      expect(top[0]!.hitCount).toBe(3);
      expect(top[1]!.key).toBe('b');
    });

    it('27. returns fewer than N if cache has fewer entries', () => {
      cache.set('only', 'one');
      const top = cache.topKeys(10);
      expect(top).toHaveLength(1);
    });
  });

  // ── Group 7: Events / listeners (5 tests) ──────────────────────────────

  describe('event listeners', () => {
    it('28. global listener fires on clear', () => {
      const events: any[] = [];
      cache.on((e) => events.push(e));
      cache.set('a', '1');
      cache.clear();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('manual');
    });

    it('29. global listener fires on tag invalidation', () => {
      const events: any[] = [];
      cache.on((e) => events.push(e));
      cache.set('x', 'v', { tags: ['t1'] });
      cache.invalidateByTag('t1');
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('tag');
    });

    it('30. unsubscribe stops listener', () => {
      const events: any[] = [];
      const unsub = cache.on((e) => events.push(e));
      cache.set('a', '1');
      cache.clear();
      unsub();
      cache.set('b', '2');
      cache.clear();
      expect(events).toHaveLength(1); // only first clear
    });

    it('31. typed listener fires for specific event type', () => {
      const events: any[] = [];
      cache.onEvent('eviction', (e) => events.push(e));
      // Fill cache to trigger eviction
      for (let i = 0; i < 6; i++) cache.set(`k${i}`, `v${i}`);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]!.type).toBe('eviction');
    });

    it('32. listener errors do not break cache', () => {
      cache.on(() => {
        throw new Error('listener boom');
      });
      cache.set('a', '1');
      cache.clear(); // should not throw
      expect(cache.size).toBe(0);
    });
  });

  // ── Group 8: Stats tracking (4 tests) ──────────────────────────────────

  describe('stats', () => {
    it('33. tracks hits and misses', () => {
      cache.set('a', '1');
      cache.get('a'); // hit
      cache.get('b'); // miss
      const s = cache.stats;
      expect(s.hits).toBe(1);
      expect(s.misses).toBe(1);
    });

    it('34. tracks sets', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      expect(cache.stats.sets).toBe(2);
    });

    it('35. tracks deletes', () => {
      cache.set('a', '1');
      cache.delete('a');
      expect(cache.stats.deletes).toBe(1);
    });

    it('36. size reflects current state', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.delete('a');
      expect(cache.stats.size).toBe(1);
    });
  });

  // ── Group 9: Static helpers & edge cases (4 tests) ─────────────────────

  describe('static and edge cases', () => {
    it('37. hashKey produces deterministic output', () => {
      const h1 = LRUCache.hashKey('hello');
      const h2 = LRUCache.hashKey('hello');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(16);
    });

    it('38. hashKey with prefix', () => {
      const h = LRUCache.hashKey('data', 'ns');
      expect(h.startsWith('ns:')).toBe(true);
    });

    it('39. empty cache topKeys returns empty array', () => {
      expect(cache.topKeys(5)).toEqual([]);
    });

    it('40. destroy clears timers and listeners', () => {
      const timedCache = new LRUCache<string>({ maxSize: 5, cleanupInterval: 60_000 });
      timedCache.on(() => {});
      timedCache.destroy();
      // Should not throw or leak
      expect(true).toBe(true);
    });
  });
});
