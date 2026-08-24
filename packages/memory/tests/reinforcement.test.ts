// v0.4.9 A9: Memory Decay & Reinforcement Unit Tests

import { describe, it, expect } from 'vitest';
import {
  decayStrength,
  reinforceStrength,
  effectiveStrength,
  reinforceMetadata,
  DEFAULT_HALF_LIFE_MS,
} from '../src/reinforcement.js';
import { TieredMemoryStore } from '../src/tieredStore.js';
import type { MemoryEntry } from '@ghita/shared';

describe('decayStrength', () => {
  it('halves strength after one half-life', () => {
    expect(decayStrength(1, DEFAULT_HALF_LIFE_MS)).toBeCloseTo(0.5, 5);
  });
  it('returns the input for non-positive elapsed', () => {
    expect(decayStrength(0.8, 0)).toBe(0.8);
    expect(decayStrength(0.8, -100)).toBe(0.8);
  });
  it('clamps to [0,1]', () => {
    expect(decayStrength(5, 0)).toBe(1);
    expect(decayStrength(-5, 0)).toBe(0);
  });
});

describe('reinforceStrength', () => {
  it('increases with diminishing returns and never exceeds 1', () => {
    let s = 0;
    for (let i = 0; i < 100; i++) s = reinforceStrength(s);
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThan(0.99);
  });
  it('first reinforcement from zero equals the gain', () => {
    expect(reinforceStrength(0, { gain: 0.2 })).toBeCloseTo(0.2, 5);
  });
});

describe('effectiveStrength', () => {
  it('decays a stored value from its last reinforcement', () => {
    const now = 1_000_000_000_000;
    const last = now - DEFAULT_HALF_LIFE_MS;
    expect(effectiveStrength(1, last, now)).toBeCloseTo(0.5, 5);
  });
});

describe('reinforceMetadata', () => {
  it('sets _strength and _lastReinforced', () => {
    const now = 1_000;
    const md = reinforceMetadata({}, now);
    expect(md._strength).toBeCloseTo(0.2, 5);
    expect(md._lastReinforced).toBe(now);
  });
  it('reinforcing again later reflects prior decay', () => {
    const t0 = 0;
    const md1 = reinforceMetadata({}, t0); // 0.2
    const t1 = DEFAULT_HALF_LIFE_MS; // one half-life later
    const md2 = reinforceMetadata(md1, t1);
    // decayed 0.2 → 0.1, then reinforced: 0.1 + 0.2*(1-0.1) = 0.28
    expect(md2._strength as number).toBeCloseTo(0.28, 5);
  });
});

describe('TieredMemoryStore.reinforce', () => {
  function entry(id: string): MemoryEntry {
    return { id, type: 'fact', content: `content ${id}`, timestamp: Date.now(), metadata: {} };
  }

  it('reinforces an existing working-memory entry', () => {
    const store = new TieredMemoryStore();
    store.add(entry('m1'));
    const strength = store.reinforce('m1');
    expect(strength).toBeGreaterThan(0);
    expect(store.getStrength('m1')).toBeGreaterThan(0);
  });

  it('returns undefined for an unknown id', () => {
    const store = new TieredMemoryStore();
    expect(store.reinforce('nope')).toBeUndefined();
    expect(store.getStrength('nope')).toBe(0);
  });

  it('repeated reinforcement increases strength monotonically (bounded)', () => {
    const store = new TieredMemoryStore();
    store.add(entry('m2'));
    const s1 = store.reinforce('m2')!;
    const s2 = store.reinforce('m2')!;
    expect(s2).toBeGreaterThanOrEqual(s1);
    expect(s2).toBeLessThanOrEqual(1);
  });
});
