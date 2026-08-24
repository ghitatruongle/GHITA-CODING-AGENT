// Wave 3 — ai-engine key manager / fallback / cleanSlop

import { describe, it, expect, vi } from 'vitest';
import { KeyManager } from '../src/key-manager.js';
import { DynamicFallbackRouter } from '../src/router/fallback.js';
import { cleanSlop } from '../src/middleware/antiSlop.js';

describe('KeyManager', () => {
  it('rotates keys with failover and reports health', () => {
    const km = new KeyManager(['sk-aaaa1111bbbb2222', 'sk-cccc3333dddd4444'], 'failover');
    expect(km.size).toBe(2);
    expect(km.getNextKey()).toBe('sk-aaaa1111bbbb2222');
    km.reportSuccess('sk-aaaa1111bbbb2222');
    expect(km.hasHealthyKey()).toBe(true);

    km.reportFailure('sk-aaaa1111bbbb2222', 401);
    expect(km.getNextKey()).toBe('sk-cccc3333dddd4444');

    const health = km.getHealthStatus();
    expect(health.totalKeys).toBe(2);
    expect(health.keyStats[0]?.keyPrefix.length).toBeGreaterThan(0);
  });

  it('cooldowns on 429 and consecutive failures', () => {
    vi.useFakeTimers();
    const km = new KeyManager(['sk-1111222233334444'], 'failover');
    km.reportFailure('sk-1111222233334444', 429);
    const status = km.getHealthStatus();
    expect(status.coolDownKeys).toBe(1);

    const km2 = new KeyManager(['sk-aaaaaaaabbbbbbbb'], 'failover');
    km2.reportFailure('sk-aaaaaaaabbbbbbbb', 500);
    km2.reportFailure('sk-aaaaaaaabbbbbbbb', 500);
    km2.reportFailure('sk-aaaaaaaabbbbbbbb', 500);
    expect(km2.getHealthStatus().coolDownKeys).toBe(1);

    km.resetKey('sk-1111222233334444');
    expect(km.hasHealthyKey()).toBe(true);
    expect(km.addKey('sk-zzzz9999yyyy8888')).toBe(true);
    expect(km.removeKey('sk-zzzz9999yyyy8888')).toBe(true);
    km.setStrategy('round-robin');
    expect(km.getKeys().length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('supports round-robin and random strategies', () => {
    const km = new KeyManager(['k1-xxxx1111yyyy', 'k2-xxxx2222yyyy'], 'round-robin');
    expect(km.getNextKey()).toBeTruthy();
    expect(km.getNextKey()).toBeTruthy();
    km.setStrategy('random');
    expect(km.getNextKey()).toBeTruthy();
  });
});

describe('DynamicFallbackRouter', () => {
  it('executes primary target successfully', async () => {
    const router = new DynamicFallbackRouter({
      chain: [
        { id: 'a', provider: 'openai', model: 'gpt-4o-mini' },
        { id: 'b', provider: 'anthropic', model: 'claude' },
      ],
      dynamicReorder: false,
      retry: { maxRetries: 0, jitter: false, baseDelayMs: 1 },
    });
    const result = await router.execute(async (t) => `ok:${t.id}`);
    expect(result.result).toBe('ok:a');
    expect(result.attempts[0]?.success).toBe(true);
  });

  it('falls over to next target after failures', async () => {
    const router = new DynamicFallbackRouter({
      chain: [
        { id: 'bad', provider: 'openai', model: 'x' },
        { id: 'good', provider: 'google', model: 'y' },
      ],
      dynamicReorder: false,
      retry: { maxRetries: 0, jitter: false, baseDelayMs: 1 },
      circuitBreaker: { failureThreshold: 1, openDurationMs: 60_000 },
    });
    let n = 0;
    const result = await router.execute(async (t) => {
      n += 1;
      if (t.id === 'bad') throw new Error('down');
      return 'recovered';
    });
    expect(result.result).toBe('recovered');
    expect(result.target.id).toBe('good');
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it('manages chain membership', () => {
    const router = new DynamicFallbackRouter({ dynamicReorder: false });
    router.setChain([{ id: '1', provider: 'openai', model: 'm' }]);
    router.addTarget({ id: '2', provider: 'anthropic', model: 'm' });
    expect(router.getChain()).toHaveLength(2);
    expect(router.removeTarget('1')).toBe(true);
    expect(router.getChain()).toHaveLength(1);
  });
});

describe('cleanSlop', () => {
  it('strips common filler openings', () => {
    const cleaned = cleanSlop('Certainly! Here is the answer you need.');
    expect(cleaned.toLowerCase()).not.toMatch(/^certainly/);
    expect(cleaned.length).toBeGreaterThan(0);
  });

  it('leaves normal technical text intact enough', () => {
    const text = 'function add(a, b) { return a + b; }';
    expect(cleanSlop(text)).toContain('function add');
  });
});
