//
// Covers the warm-count arithmetic fix in `TierManager.migrate()`:
// the previous expression was `warm.length - demoted.filter(...).length`,
// but demoted entries had just been re-tagged `tier = 'warm'` so the
// subtraction under-counted the warm tier and the eviction trigger
// fired too late — letting the warm tier grow unboundedly.
//
// The fix replaces `-` with `+`:
//   `warm.length + demoted.filter((e) => e.tier === 'warm').length`
//
// These tests build a synthetic `MemoryStorageAdapter` and assert that
// the eviction actually triggers when it should, and doesn't when it
// shouldn't.

import { describe, it, expect } from 'vitest';
import { TierManager } from '../src/compression/tier-manager.js';
import type {
  CompressableMemoryEntry,
  MemoryStorageAdapter,
  MemoryTier,
} from '../src/compression/types.js';

function makeEntry(
  id: string,
  tier: MemoryTier,
  opts: Partial<CompressableMemoryEntry> = {},
): CompressableMemoryEntry {
  return {
    id,
    type: 'note',
    content: 'x',
    timestamp: 0,
    tier,
    accessCount: 1,
    lastAccessedAt: 0,
    importance: 0.5,
    ...opts,
  };
}

/** In-memory adapter implementing `MemoryStorageAdapter`. */
function makeAdapter(entries: CompressableMemoryEntry[]): MemoryStorageAdapter {
  const store = new Map(entries.map((e) => [e.id, e]));
  return {
    list: async (filter) => {
      const all = Array.from(store.values());
      return filter?.tier ? all.filter((e) => e.tier === filter.tier) : all;
    },
    get: async (id) => store.get(id) ?? null,
    upsert: async (batch) => {
      for (const entry of batch) store.set(entry.id, entry);
    },
    delete: async (ids) => {
      for (const id of ids) store.delete(id);
    },
    countByTier: async () => {
      let hot = 0,
        warm = 0,
        cold = 0;
      for (const e of store.values()) {
        if (e.tier === 'hot') hot++;
        else if (e.tier === 'warm') warm++;
        else cold++;
      }
      return { hot, warm, cold };
    },
  };
}

describe('Audit Fix 2.19 — TierManager warm-count arithmetic', () => {
  // We previously had two additional tests here that were removed during a
  // pre-commit code review:
  //   * A source-grep test that asserted the regex `warm.length + demoted`
  //     matched the implementation. It caught literal regressions of the
  //     audit fix but was brittle to legitimate refactors (e.g. extracting
  //     the expression into a helper variable). Behavioural coverage in the
  //     remaining test below is sufficient.
  //   * A "10 warm entries, warmMaxSize=5" smoke test. Both the buggy `-`
  //     and the fixed `+` produce the same value here (10 - 0 = 10 + 0 = 10)
  //     because no `demoted` entries of tier=warm exist — only pure-warm
  //     input. So this test passed for the wrong reasons; the test below
  //     is the actual regression coverage.

  it('eviction fires when hot→warm demotions push warm past warmMaxSize', async () => {
    // Critical scenario: we start with hot entries just over hotMaxSize, so
    // they get demoted to warm, pushing warm past warmMaxSize. With the broken
    // `-`, `currentWarmCount = warm.length - demoted.length` could underflow
    // and skip eviction entirely.
    const entries: CompressableMemoryEntry[] = [];
    // hotMaxSize = 3, so 5 hot entries means 2 will be demoted to warm.
    for (let i = 0; i < 5; i++) {
      entries.push(
        makeEntry(`h${i}`, 'hot', {
          // Very low score so they're the first to be demoted.
          importance: 0.1,
          accessCount: 0,
          lastAccessedAt: 0,
          timestamp: 0,
        }),
      );
    }
    // 4 pre-existing warm entries.
    for (let i = 0; i < 4; i++) {
      entries.push(makeEntry(`w${i}`, 'warm'));
    }
    // warmMaxSize = 5. After hot→warm demotion of 2, warm should be 6.
    // With the fix: currentWarmCount = 4 + 2 = 6 > 5 → evict 1 to cold.
    // With the bug: currentWarmCount = 4 - 2 = 2 ≤ 5 → NO eviction.
    const adapter = makeAdapter(entries);
    const tm = new TierManager({ hotMaxSize: 3, warmMaxSize: 5 });

    const result = await tm.migrate(adapter, 1000);

    // The fix ensures at least one warm entry is demoted to cold.
    const warmToCold = result.demoted.filter((e) => e.tier === 'cold');
    expect(warmToCold.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT evict when warm tier is below warmMaxSize', async () => {
    const entries: CompressableMemoryEntry[] = [];
    for (let i = 0; i < 3; i++) {
      entries.push(makeEntry(`w${i}`, 'warm'));
    }
    const adapter = makeAdapter(entries);
    const tm = new TierManager({ hotMaxSize: 100, warmMaxSize: 10 });

    const result = await tm.migrate(adapter, 1000);
    expect(result.demoted.filter((e) => e.tier === 'cold').length).toBe(0);
  });

  it('preserves total entry count after migration (no entries invented or lost)', async () => {
    // Defence-in-depth: any eviction logic must not silently drop entries.
    const entries: CompressableMemoryEntry[] = [];
    for (let i = 0; i < 12; i++) {
      entries.push(makeEntry(`e${i}`, i < 5 ? 'hot' : 'warm'));
    }
    const adapter = makeAdapter(entries);
    const tm = new TierManager({ hotMaxSize: 4, warmMaxSize: 6, coldAgeMs: 0 });

    const result = await tm.migrate(adapter, 1000);
    // Count should be preserved (no entries are deleted by `migrate`).
    expect(result.counts.hot + result.counts.warm + result.counts.cold).toBe(12);
  });
});
