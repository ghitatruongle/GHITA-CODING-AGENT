import { describe, it, expect } from 'vitest';
import { SmartRouter } from '../src/routing/smart-router.js';

describe('SmartRouter', () => {
  const providers = [
    { type: 'openai' as const, model: 'gpt-4o' },
    { type: 'deepseek' as const, model: 'deepseek-chat' },
    { type: 'groq' as const, model: 'llama-3.1-70b-versatile' },
  ];

  describe('route - cost-first', () => {
    it('should pick cheapest provider', () => {
      const router = new SmartRouter({ strategy: 'cost-first' });
      const decision = router.route(providers);
      expect(decision).not.toBeNull();
      expect(decision!.reason).toBe('Lowest cost');
    });
  });

  describe('route - quality-first', () => {
    it('should pick highest quality provider', () => {
      const router = new SmartRouter({ strategy: 'quality-first' });
      const decision = router.route(providers);
      expect(decision).not.toBeNull();
      expect(decision!.reason).toBe('Highest quality');
      expect(decision!.provider).toBe('openai');
    });
  });

  describe('route - latency-first', () => {
    it('should pick lowest latency provider', () => {
      const router = new SmartRouter({ strategy: 'latency-first' });
      const decision = router.route(providers);
      expect(decision).not.toBeNull();
      expect(decision!.reason).toBe('Lowest latency');
    });
  });

  describe('route - balanced', () => {
    it('should return a balanced decision', () => {
      const router = new SmartRouter({ strategy: 'balanced' });
      const decision = router.route(providers);
      expect(decision).not.toBeNull();
      expect(decision!.reason).toContain('Balanced');
    });
  });

  describe('route - empty providers', () => {
    it('should return null for empty list', () => {
      const router = new SmartRouter({ strategy: 'cost-first' });
      expect(router.route([])).toBeNull();
    });
  });

  describe('updateMetrics', () => {
    it('should track metrics after updates', () => {
      const router = new SmartRouter({ strategy: 'balanced' });
      router.updateMetrics('openai', 'gpt-4o', 500, true, 0.005);
      router.updateMetrics('openai', 'gpt-4o', 600, true, 0.006);
      const metrics = router.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.provider).toBe('openai');
      expect(metrics[0]!.successRate).toBeGreaterThan(0);
    });
  });

  describe('setStrategy', () => {
    it('should change strategy', () => {
      const router = new SmartRouter({ strategy: 'cost-first' });
      router.setStrategy('quality-first');
      const decision = router.route(providers);
      expect(decision!.provider).toBe('openai');
    });
  });
});
