import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FallbackManager } from '../src/gateway/fallbackManager.js';
import type { ChatMessage, ChatResponse } from '../src/types.js';

describe('FallbackManager Router Optimization Tests', () => {
  const tempDir = path.resolve(process.cwd(), 'packages/ai-engine/tests/temp-opt-dir');
  const budgetConfigPath = path.join(tempDir, 'budget.yaml');
  const dbPath = ':memory:';
  let manager: FallbackManager;

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const budgetYaml = `budget:
  max_cost_per_session: 1.0
  max_cost_per_day: 5.0
  alert_threshold_percent: 50.0
`;
    fs.writeFileSync(budgetConfigPath, budgetYaml, 'utf-8');

    manager = new FallbackManager({
      dbPath,
      budgetConfigPath,
      fallbackChain: ['gpt-4o-mini', 'claude-3-7-sonnet', 'deepseek-r1'],
    });
  });

  afterEach(() => {
    if (manager) {
      manager.close();
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[Cleanup] Failed to remove tempDir in afterEach:`, err);
      }
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('1. Dynamic Model Timeout Control', () => {
    it('should time out a slow model call and fallback to the next model', async () => {
      // Mock callFn: gpt-4o-mini takes 4000ms (timeout is 3000ms)
      // claude-3-7-sonnet resolves instantly
      const callFn = vi.fn().mockImplementation(async (model: string) => {
        if (model === 'gpt-4o-mini') {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          return { content: 'slow' } as ChatResponse;
        }
        return {
          content: 'fallback success',
          model,
          provider: 'test',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        } as ChatResponse;
      });

      // We use fake timers to accelerate the timeout of 3000ms
      vi.useFakeTimers();

      const promise = manager.executeWithFailover(callFn, []);

      // Advance timers to trigger the gpt-4o-mini timeout (which triggers failover)
      await vi.advanceTimersByTimeAsync(3500);

      const result = await promise;
      expect(result.content).toBe('fallback success');
      expect(result.model).toBe('claude-3-7-sonnet');
      expect(callFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. Circuit Breaker Registry', () => {
    it('should trip the circuit breaker after 3 failures and bypass the model for 60s', async () => {
      // Make 3 failing calls to gpt-4o-mini
      let failCount = 0;
      const failingCallFn = vi.fn().mockImplementation(async (model: string) => {
        if (model === 'gpt-4o-mini') {
          failCount++;
          throw new Error('Transient error');
        }
        return {
          content: 'fallback',
          model,
          provider: 'test',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        } as ChatResponse;
      });

      // Mock Date.now using a mutable variable
      let fakeTime = 1000000;
      const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

      // Run executeWithFailover 3 times, each will attempt gpt-4o-mini, fail, and succeed on claude-3-7-sonnet
      await manager.executeWithFailover(failingCallFn, []);
      await manager.executeWithFailover(failingCallFn, []);
      await manager.executeWithFailover(failingCallFn, []);

      expect(failCount).toBe(3);

      // Reset mock spy call log but keep implementation
      failingCallFn.mockClear();

      // The 4th call should NOT try gpt-4o-mini because circuit breaker is tripped!
      // It should go directly to claude-3-7-sonnet
      const response = await manager.executeWithFailover(failingCallFn, []);
      expect(response.model).toBe('claude-3-7-sonnet');
      expect(failingCallFn).toHaveBeenCalledTimes(1); // Only called once for claude-3-7-sonnet
      expect(failingCallFn.mock.calls.some(call => call[0] === 'gpt-4o-mini')).toBe(false);

      // Now advance the mock time by 61 seconds (breaker reset window)
      fakeTime += 61000;
      failingCallFn.mockClear();

      const response2 = await manager.executeWithFailover(failingCallFn, []);

      // Breaker is reset, so gpt-4o-mini is tried again
      expect(failingCallFn.mock.calls.some(call => call[0] === 'gpt-4o-mini')).toBe(true);

      dateSpy.mockRestore();
    });
  });

  describe('3. Dynamic Backoff Logic', () => {
    it('should wait 500ms for rate limits and 100ms for transient errors', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      // Setup a rate limit error (429) for gpt-4o-mini, success on claude-3-7-sonnet
      const rateLimitCall = vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP 429: Too many requests'))
        .mockResolvedValueOnce({
          content: 'success',
          model: 'claude-3-7-sonnet',
          provider: 'test',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        } as ChatResponse);

      await manager.executeWithFailover(rateLimitCall, []);
      // The failover delay is 500ms, which maps to a setTimeout call
      const rateLimitTimeoutCall = setTimeoutSpy.mock.calls.find((c) => c[1] === 500);
      expect(rateLimitTimeoutCall).toBeDefined();

      setTimeoutSpy.mockClear();

      // Setup a transient error for gpt-4o-mini, success on claude-3-7-sonnet
      const transientCall = vi
        .fn()
        .mockRejectedValueOnce(new Error('Transient error 503'))
        .mockResolvedValueOnce({
          content: 'success',
          model: 'claude-3-7-sonnet',
          provider: 'test',
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        } as ChatResponse);

      await manager.executeWithFailover(transientCall, []);
      // The failover delay is 100ms
      const transientTimeoutCall = setTimeoutSpy.mock.calls.find((c) => c[1] === 100);
      expect(transientTimeoutCall).toBeDefined();
    });
  });
});
