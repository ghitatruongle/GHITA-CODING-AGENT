import { describe, expect, it } from 'vitest';
import { ModelCatalog, createDefaultCatalog } from './model-catalog.js';
import type { ModelEntry } from './model-catalog.js';

describe('ModelCatalog', () => {
  it('registers and retrieves models', () => {
    const catalog = new ModelCatalog();
    const entry: ModelEntry = {
      id: 'test-model',
      name: 'Test Model',
      provider: 'openai',
      contextWindow: 128_000,
      maxOutputTokens: 4096,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10,
      supportsTools: true,
      supportsJsonOutput: false,
      supportsVision: false,
      supportsThinking: false,
      qualityScore: 80,
    };
    catalog.register(entry);
    expect(catalog.get('test-model')).toEqual(entry);
    expect(catalog.size).toBe(1);
  });

  it('returns default context window for unknown models', () => {
    const catalog = new ModelCatalog();
    expect(catalog.getContextWindow('unknown')).toBe(128_000);
  });

  it('estimates cost correctly', () => {
    const catalog = new ModelCatalog();
    catalog.register({
      id: 'm1',
      name: 'M1',
      provider: 'openai',
      contextWindow: 128_000,
      maxOutputTokens: 4096,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10,
      supportsTools: false,
      supportsJsonOutput: false,
      supportsVision: false,
      supportsThinking: false,
      qualityScore: 80,
    });
    // 1M input + 1M output = $2.5 + $10 = $12.5
    const cost = catalog.estimateCost('m1', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(12.5, 5);
  });

  it('finds models by capability', () => {
    const catalog = createDefaultCatalog();
    const visionModels = catalog.findByCapability('vision');
    expect(visionModels.length).toBeGreaterThan(0);
    for (const m of visionModels) {
      expect(m.supportsVision).toBe(true);
    }
  });

  it('lists models by provider', () => {
    const catalog = createDefaultCatalog();
    const openaiModels = catalog.listByProvider('openai');
    expect(openaiModels.length).toBeGreaterThan(0);
    for (const m of openaiModels) {
      expect(m.provider).toBe('openai');
    }
  });
});

describe('Failover + Round-Robin', () => {
  it('selects from failover group in round-robin order', () => {
    const catalog = createDefaultCatalog();
    const first = catalog.selectFromGroup('flagship-chat');
    const second = catalog.selectFromGroup('flagship-chat');
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // Round-robin should advance to a different model
    expect(first!.id).not.toBe(second!.id);
  });

  it('skips down providers in failover selection', () => {
    const catalog = createDefaultCatalog();
    const downProviders = new Set(['anthropic' as const]);
    const selected = catalog.selectFromGroup('flagship-chat', downProviders);
    expect(selected).toBeDefined();
    expect(selected!.provider).not.toBe('anthropic');
  });

  it('resolveWithFailover returns preferred when available', () => {
    const catalog = createDefaultCatalog();
    const resolved = catalog.resolveWithFailover('gpt-4o');
    expect(resolved.id).toBe('gpt-4o');
  });

  it('resolveWithFailover falls back when preferred provider is down', () => {
    const catalog = createDefaultCatalog();
    const downProviders = new Set(['openai' as const]);
    const resolved = catalog.resolveWithFailover('gpt-4o', downProviders);
    expect(resolved.provider).not.toBe('openai');
  });

  it('returns undefined when all group members are down', () => {
    const catalog = new ModelCatalog();
    catalog.register({
      id: 'only-model',
      name: 'Only',
      provider: 'openai',
      contextWindow: 128_000,
      maxOutputTokens: 4096,
      inputCostPer1M: 1,
      outputCostPer1M: 1,
      supportsTools: false,
      supportsJsonOutput: false,
      supportsVision: false,
      supportsThinking: false,
      qualityScore: 50,
    });
    catalog.registerFailoverGroup({ name: 'solo', modelIds: ['only-model'] });
    const result = catalog.selectFromGroup('solo', new Set(['openai']));
    expect(result).toBeUndefined();
  });
});

describe('createDefaultCatalog', () => {
  it('has models registered', () => {
    const catalog = createDefaultCatalog();
    expect(catalog.size).toBeGreaterThan(10);
  });

  it('has failover groups registered', () => {
    const catalog = createDefaultCatalog();
    const groups = catalog.listFailoverGroups();
    expect(groups).toContain('flagship-chat');
    expect(groups).toContain('fast-code');
    expect(groups).toContain('reasoning');
  });
});
