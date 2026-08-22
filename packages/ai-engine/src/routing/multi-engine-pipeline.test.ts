// ==============================================================================
// GHITA CODING AGENT — MultiEnginePipeline Tests (v1.1.5-beta2 Track 4)
// ==============================================================================

import { describe, it, expect, vi } from 'vitest';
import { MultiEnginePipeline } from './multi-engine-pipeline.js';
import { ModelCatalog } from './model-catalog.js';

describe('MultiEnginePipeline', () => {
  const catalog = new ModelCatalog();
  catalog.register({
    id: 'openai:gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputTokens: 4096,
    inputCostPer1M: 5,
    outputCostPer1M: 15,
    supportsTools: true,
    supportsJsonOutput: true,
    supportsVision: true,
    supportsThinking: false,
    qualityScore: 90,
  });

  catalog.register({
    id: 'anthropic:claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 8192,
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    supportsTools: true,
    supportsJsonOutput: true,
    supportsVision: true,
    supportsThinking: true,
    qualityScore: 98,
  });

  it('selects model and calculates reasoning budget according to role and prompt complexity', () => {
    const pipeline = new MultiEnginePipeline({ catalog });
    const selection = pipeline.selectModel(
      'plan',
      'Please architect a new microservice and refactor database transactions.',
      {
        candidates: ['anthropic:claude-opus-4', 'openai:gpt-4o'],
      },
    );

    expect(['anthropic:claude-opus-4', 'openai:gpt-4o']).toContain(selection.modelId);
    expect(selection.tier).toBe('complex');
    expect(selection.fallbackChain.length).toBeGreaterThan(0);
  });

  it('executes operation with dynamic fallback on failure and observes bandit rewards', async () => {
    const pipeline = new MultiEnginePipeline({ catalog });
    const selection = pipeline.selectModel('editor', 'Fix typo', {
      candidates: ['openai:gpt-4o', 'anthropic:claude-opus-4'],
    });

    const fallbackSpy = vi.fn();
    let callCount = 0;

    const res = await pipeline.executeWithDynamicFallback(
      async (modelId) => {
        callCount++;
        if (modelId === selection.modelId) {
          throw new Error('429 Rate limit exceeded');
        }
        return `Success from ${modelId}`;
      },
      selection,
      {
        maxRetriesPerModel: 1,
        baseBackoffMs: 10,
        onFallback: fallbackSpy,
      },
    );

    expect(res.result).toContain('Success from');
    expect(res.usedModel).not.toBe(selection.modelId);
    expect(callCount).toBeGreaterThan(1);
    expect(fallbackSpy).toHaveBeenCalled();
  });

  it('throws descriptive error if all fallback models fail', async () => {
    const pipeline = new MultiEnginePipeline({ catalog });
    const selection = pipeline.selectModel('fast', 'hello', {
      candidates: ['openai:gpt-4o'],
    });

    await expect(
      pipeline.executeWithDynamicFallback(
        async () => {
          throw new Error('500 Internal Server Error');
        },
        selection,
        {
          maxRetriesPerModel: 1,
          baseBackoffMs: 10,
        },
      ),
    ).rejects.toThrow(/All models in fallback chain failed/);
  });
});
