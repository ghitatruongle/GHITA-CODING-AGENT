import { describe, it, expect, vi } from 'vitest';
import { AdaptiveBanditRouter, betaSample } from './adaptive-router.js';
import { ModelRoleRouter, DEFAULT_ROLE_CHAINS, qualifyModelId } from './model-roles.js';
import { ModelPricingDB, estimateCost, DEFAULT_MODEL_PRICES } from '../cost/model-prices.js';
import {
  DistributedCache,
  ObjectStoreCache,
  DualModeCache,
  type ObjectStore,
} from '../cache/distributed.js';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

describe('AdaptiveBanditRouter', () => {
  it('registers arms and selects deterministically when epsilon=0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42);
    const router = new AdaptiveBanditRouter({ epsilon: 0 });
    router.registerArm('a', 'arm-a');
    router.registerArm('b', 'arm-b');
    const selected = router.select();
    expect(['a', 'b']).toContain(selected.id);
    vi.restoreAllMocks();
  });

  it('learns: successful arms dominate the ranking', () => {
    const router = new AdaptiveBanditRouter({ epsilon: 0, priorAlpha: 2, priorBeta: 2 });
    router.registerArm('good');
    router.registerArm('bad');
    for (let i = 0; i < 50; i++) router.observe('good', 'success');
    for (let i = 0; i < 50; i++) router.observe('bad', 'error');
    const ranking = router.ranking();
    expect(ranking[0]?.arm.id).toBe('good');
    expect(ranking[0]?.expectedReward).toBeGreaterThan(ranking[1]?.expectedReward ?? 0);
  });

  it('observes latency averages', () => {
    const router = new AdaptiveBanditRouter();
    router.registerArm('a');
    router.observe('a', 'success', 100);
    router.observe('a', 'success', 300);
    expect(router.get('a')?.avgLatencyMs).toBe(200);
  });

  it('throws when no arms are registered', () => {
    const router = new AdaptiveBanditRouter();
    expect(() => router.select()).toThrow('no arms');
  });

  it('betaSample stays within [0,1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = betaSample(3, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('ModelRoleRouter', () => {
  it('resolves the first available model per role chain', () => {
    const router = new ModelRoleRouter({
      available: ['openai:gpt-4o-mini', 'anthropic:claude-sonnet-4'],
    });
    const smol = router.resolve('smol');
    expect(smol.model).toBe('openai:gpt-4o-mini');
    const plan = router.resolve('plan');
    expect(plan.model).toBe('anthropic:claude-sonnet-4');
  });

  it('returns first chain entry when no availability filter', () => {
    const router = new ModelRoleRouter();
    expect(router.resolve('fast').model).toBe(DEFAULT_ROLE_CHAINS.fast[0]);
  });

  it('reports unavailable roles with reason', () => {
    const router = new ModelRoleRouter({ available: ['openai:gpt-4o-mini'] });
    const res = router.resolve('orchestrator');
    expect(res.model).toBeUndefined();
    expect(res.reason).toContain('no available model');
  });

  it('exposes fallback chains and qualification', () => {
    const router = new ModelRoleRouter({ available: ['anthropic:claude-sonnet-4'] });
    expect(router.fallbackChain('editor')).toEqual(['anthropic:claude-sonnet-4']);
    expect(qualifyModelId('openai', 'gpt-4o')).toBe('openai:gpt-4o');
  });
});

describe('ModelPricingDB', () => {
  it('looks up prices exactly and fuzzily', () => {
    const db = new ModelPricingDB();
    const exact = db.lookup('openai', 'gpt-4o-mini');
    expect(exact.price?.inputPer1k).toBe(0.00015);
    const fuzzy = db.lookup('anthropic', 'claude-sonnet-4-latest');
    expect(fuzzy.price?.model).toBe('claude-sonnet-4');
  });

  it('syncs from a fetcher', async () => {
    const db = new ModelPricingDB([]);
    await db.sync(async () => [
      {
        id: 'x:y',
        provider: 'x',
        model: 'y',
        inputPer1k: 1,
        outputPer1k: 2,
        contextWindow: 1000,
        updatedAt: '',
      },
    ]);
    expect(db.count()).toBe(1);
    expect(db.get('x:y')?.updatedAt).toBeTruthy();
  });

  it('estimates costs', () => {
    const price = must(DEFAULT_MODEL_PRICES[0]);
    const cost = estimateCost(price, 1000, 500);
    expect(cost).toBeCloseTo(price.inputPer1k + price.outputPer1k * 0.5, 8);
  });
});

describe('distributed caches', () => {
  function memoryStore(): ObjectStore {
    const data = new Map<string, { value: string; expiresAt?: number }>();
    return {
      get: async (k) => data.get(k),
      set: async (k, v, ttlMs) =>
        data.set(k, { value: v, expiresAt: ttlMs ? Date.now() + ttlMs : undefined }),
      delete: async (k) => {
        data.delete(k);
      },
    };
  }

  it('DistributedCache reads primary then promotes from secondary', async () => {
    const primary = new Map<string, unknown>();
    const secondary = new Map<string, unknown>();
    const cache = new DistributedCache(
      {
        get: async (k) => primary.get(k) ?? null,
        set: async (k, v) => {
          primary.set(k, v);
        },
        delete: async (k) => {
          primary.delete(k);
        },
        clear: async () => primary.clear(),
      },
      {
        get: async (k) => secondary.get(k) ?? null,
        set: async (k, v) => {
          secondary.set(k, v);
        },
        delete: async (k) => {
          secondary.delete(k);
        },
        clear: async () => secondary.clear(),
      },
    );
    secondary.set('k', 'v-from-secondary');
    expect(await cache.get('k')).toBe('v-from-secondary');
    expect(primary.get('k')).toBe('v-from-secondary'); // promoted
    await cache.set('k2', 'v2');
    expect(await cache.get('k2')).toBe('v2');
  });

  it('ObjectStoreCache respects TTL expiry', async () => {
    const store = memoryStore();
    const cache = new ObjectStoreCache(store);
    await cache.set('k', 'v', 1);
    expect(await cache.get('k')).toBe('v');
    // Force expiry by manipulating the store directly.
    await store.set('k', 'v', -1000);
    expect(await cache.get('k')).toBeNull();
  });

  it('DualModeCache fans out writes to both layers', async () => {
    const exact = new Map<string, unknown>();
    const semantic = new Map<string, unknown>();
    const dual = new DualModeCache(
      {
        get: async (k) => exact.get(k) ?? null,
        set: async (k, v) => {
          exact.set(k, v);
        },
        delete: async (k) => {
          exact.delete(k);
        },
        clear: async () => exact.clear(),
      },
      {
        get: async (k) => semantic.get(k) ?? null,
        set: async (k, v) => {
          semantic.set(k, v);
        },
        delete: async (k) => {
          semantic.delete(k);
        },
        clear: async () => semantic.clear(),
      },
      { ttlSeconds: 60 },
    );
    await dual.set('k', 'v');
    expect(exact.get('k')).toBe('v');
    expect(semantic.get('k')).toBe('v');
    expect(await dual.get('k')).toBe('v');
  });
});
