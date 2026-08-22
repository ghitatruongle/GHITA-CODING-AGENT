import { describe, it, expect } from 'vitest';
import {
  SmartRouter,
  AdaptiveRouter,
  DynamicFallbackRouter,
  UnifiedRouter,
} from '@ghita/ai-engine';

describe('AI Engine - Routing', () => {
  it('SmartRouter should create with quality-first strategy', () => {
    const router = new SmartRouter({
      strategy: 'quality-first' as const,
    });
    expect(router).toBeDefined();
  });

  it('SmartRouter should create with cost-first strategy', () => {
    const router = new SmartRouter({
      strategy: 'cost-first' as const,
    });
    expect(router).toBeDefined();
  });

  it('SmartRouter should create with latency-first strategy', () => {
    const router = new SmartRouter({
      strategy: 'latency-first' as const,
    });
    expect(router).toBeDefined();
  });

  it('SmartRouter should route based on available providers', async () => {
    const router = new SmartRouter({
      strategy: 'quality-first' as const,
    });
    const decision = await router.route(
      [
        { type: 'openai' as const, model: 'gpt-4o' },
        { type: 'openai' as const, model: 'gpt-4o-mini' },
      ],
      'Write a hello world program',
    );
    expect(decision).toBeDefined();
    expect(decision.provider).toBeDefined();
  });

  it('AdaptiveRouter should be constructable', () => {
    const router = new AdaptiveRouter();
    expect(router).toBeDefined();
  });

  it('DynamicFallbackRouter should be constructable', () => {
    const router = new DynamicFallbackRouter();
    expect(router).toBeDefined();
  });

  it('UnifiedRouter should be constructable', () => {
    const router = new UnifiedRouter({
      encryptionKey: '12345678901234567890123456789012',
    });
    expect(router).toBeDefined();
  });
});
