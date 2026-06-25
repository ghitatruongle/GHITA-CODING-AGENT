// ==============================================================================
// GHITA CODING AGENT - MiddlewarePipeline Unit Tests (Phase 12)
// 35 test cases covering registration, pre/post model hooks, pre/post tool
// hooks, error handling, dry-run, timeout, metrics, and stats.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiddlewarePipeline } from '../src/middleware/pipeline.js';
import type {
  AgentMiddleware,
  MiddlewareContext,
  AgentStepResult,
} from '../src/middleware/types.js';

// --- Mocks ---

const mockAgent = { id: 'agent-1', name: 'TestAgent' } as any;

function makeCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    agent: mockAgent,
    messages: [{ role: 'user', content: 'hello' }] as any,
    metadata: {},
    ...overrides,
  };
}

function makeResult(overrides?: Partial<AgentStepResult>): AgentStepResult {
  return {
    response: { role: 'assistant', content: 'reply' } as any,
    shouldContinue: false,
    ...overrides,
  };
}

function makeMiddleware(
  name: string,
  priority: number,
  hooks?: Partial<AgentMiddleware>,
): AgentMiddleware {
  return { name, priority, ...hooks } as AgentMiddleware;
}

describe('MiddlewarePipeline', () => {
  let pipeline: MiddlewarePipeline;

  beforeEach(() => {
    pipeline = new MiddlewarePipeline({ middlewareTimeoutMs: 5000 });
  });

  // ── Group 1: Registration (6 tests) ────────────────────────────────────

  describe('registration', () => {
    it('1. use adds middleware', () => {
      pipeline.use(makeMiddleware('logger', 10));
      expect(pipeline.list()).toEqual(['logger']);
    });

    it('2. use sorts by priority', () => {
      pipeline.use(makeMiddleware('b', 20));
      pipeline.use(makeMiddleware('a', 5));
      pipeline.use(makeMiddleware('c', 30));
      expect(pipeline.list()).toEqual(['a', 'b', 'c']);
    });

    it('3. remove deletes middleware', () => {
      pipeline.use(makeMiddleware('x', 1));
      expect(pipeline.remove('x')).toBe(true);
      expect(pipeline.list()).toEqual([]);
    });

    it('4. remove returns false for unknown', () => {
      expect(pipeline.remove('ghost')).toBe(false);
    });

    it('5. get returns middleware by name', () => {
      const mw = makeMiddleware('auth', 1);
      pipeline.use(mw);
      expect(pipeline.get('auth')).toBe(mw);
    });

    it('6. get returns undefined for unknown', () => {
      expect(pipeline.get('nope')).toBeUndefined();
    });
  });

  // ── Group 2: runPreModel (6 tests) ─────────────────────────────────────

  describe('runPreModel', () => {
    it('7. modifies messages in context', async () => {
      pipeline.use(
        makeMiddleware('injector', 1, {
          async preModel(ctx) {
            return { messages: [...ctx.messages, { role: 'system', content: 'injected' } as any] };
          },
        }),
      );
      const { context } = await pipeline.runPreModel(makeCtx());
      expect(context.messages).toHaveLength(2);
    });

    it('8. modifies model selection', async () => {
      pipeline.use(
        makeMiddleware('router', 1, {
          async preModel() {
            return { model: 'gpt-4o' };
          },
        }),
      );
      const { context } = await pipeline.runPreModel(makeCtx());
      expect(context.model).toBe('gpt-4o');
    });

    it('9. short-circuit bypasses model', async () => {
      pipeline.use(
        makeMiddleware('cache', 1, {
          async preModel() {
            return { shortCircuit: { role: 'assistant', content: 'cached reply' } as any };
          },
        }),
      );
      const { shortCircuit } = await pipeline.runPreModel(makeCtx());
      expect(shortCircuit).toBeDefined();
      expect((shortCircuit as any).content).toBe('cached reply');
    });

    it('10. runs middlewares in priority order', async () => {
      const order: string[] = [];
      pipeline.use(
        makeMiddleware('first', 1, {
          async preModel() {
            order.push('first');
          },
        }),
      );
      pipeline.use(
        makeMiddleware('second', 10, {
          async preModel() {
            order.push('second');
          },
        }),
      );
      await pipeline.runPreModel(makeCtx());
      expect(order).toEqual(['first', 'second']);
    });

    it('11. skips middleware without preModel', async () => {
      pipeline.use(makeMiddleware('noop', 1));
      const { context } = await pipeline.runPreModel(makeCtx());
      expect(context.messages).toHaveLength(1);
    });

    it('12. merges metadata from middleware', async () => {
      pipeline.use(
        makeMiddleware('meta', 1, {
          async preModel() {
            return { metadata: { source: 'cache' } };
          },
        }),
      );
      const { context } = await pipeline.runPreModel(makeCtx());
      expect(context.metadata.source).toBe('cache');
    });
  });

  // ── Group 3: runPostModel (4 tests) ────────────────────────────────────

  describe('runPostModel', () => {
    it('13. modifies response', async () => {
      pipeline.use(
        makeMiddleware('filter', 1, {
          async postModel() {
            return { response: { role: 'assistant', content: 'filtered' } as any };
          },
        }),
      );
      const { result } = await pipeline.runPostModel(makeCtx(), makeResult());
      expect((result.response as any).content).toBe('filtered');
    });

    it('14. triggers retry', async () => {
      pipeline.use(
        makeMiddleware('retry', 1, {
          async postModel() {
            return { retry: true, retryReason: 'rate limited' };
          },
        }),
      );
      const { retry, retryReason } = await pipeline.runPostModel(makeCtx(), makeResult());
      expect(retry).toBe(true);
      expect(retryReason).toBe('rate limited');
    });

    it('15. no retry by default', async () => {
      const { retry } = await pipeline.runPostModel(makeCtx(), makeResult());
      expect(retry).toBe(false);
    });

    it('16. merges metadata into context for subsequent middleware', async () => {
      const ctx = makeCtx();
      const seen: Record<string, unknown>[] = [];
      pipeline.use(
        makeMiddleware('tag', 1, {
          async postModel() {
            return { metadata: { tagged: true } };
          },
        }),
      );
      pipeline.use(
        makeMiddleware('reader', 2, {
          async postModel(context) {
            seen.push({ ...context.metadata });
            return {};
          },
        }),
      );
      await pipeline.runPostModel(ctx, makeResult());
      expect(seen[0]?.tagged).toBe(true);
    });
  });

  // ── Group 4: runPreTool / runPostTool (5 tests) ────────────────────────

  describe('runPreTool', () => {
    it('17. allows tool execution by default', async () => {
      const { proceed } = await pipeline.runPreTool('bash', {}, makeCtx());
      expect(proceed).toBe(true);
    });

    it('18. blocks tool execution', async () => {
      pipeline.use(
        makeMiddleware('guard', 1, {
          async preTool() {
            return { proceed: false, reason: 'forbidden' };
          },
        }),
      );
      const { proceed, reason } = await pipeline.runPreTool('rm', {}, makeCtx());
      expect(proceed).toBe(false);
      expect(reason).toBe('forbidden');
    });

    it('19. modifies tool arguments', async () => {
      pipeline.use(
        makeMiddleware('sanitize', 1, {
          async preTool(_name, args) {
            return { proceed: true, modifiedArgs: { ...args, sanitized: true } };
          },
        }),
      );
      const { args } = await pipeline.runPreTool('bash', { cmd: 'ls' }, makeCtx());
      expect((args as any).sanitized).toBe(true);
    });
  });

  describe('runPostTool', () => {
    it('20. modifies tool result', async () => {
      pipeline.use(
        makeMiddleware('format', 1, {
          async postTool() {
            return { modifiedResult: 'formatted output' };
          },
        }),
      );
      const result = await pipeline.runPostTool('bash', 'raw output', makeCtx());
      expect(result).toBe('formatted output');
    });

    it('21. returns original when no middleware', async () => {
      const result = await pipeline.runPostTool('bash', 'output', makeCtx());
      expect(result).toBe('output');
    });
  });

  // ── Group 5: runOnError / runOnComplete (4 tests) ──────────────────────

  describe('runOnError', () => {
    it('22. triggers retry on error', async () => {
      pipeline.use(
        makeMiddleware('retryOnError', 1, {
          async onError() {
            return { retry: true };
          },
        }),
      );
      const { retry } = await pipeline.runOnError(new Error('timeout'), makeCtx());
      expect(retry).toBe(true);
    });

    it('23. no retry by default', async () => {
      const { retry } = await pipeline.runOnError(new Error('x'), makeCtx());
      expect(retry).toBe(false);
    });
  });

  describe('runOnComplete', () => {
    it('24. calls onComplete hooks', async () => {
      let called = false;
      pipeline.use(
        makeMiddleware('logger', 1, {
          async onComplete() {
            called = true;
          },
        }),
      );
      await pipeline.runOnComplete(makeCtx(), { role: 'assistant', content: 'done' } as any);
      expect(called).toBe(true);
    });

    it('25. runs all onComplete hooks in order', async () => {
      const order: string[] = [];
      pipeline.use(
        makeMiddleware('a', 1, {
          async onComplete() {
            order.push('a');
          },
        }),
      );
      pipeline.use(
        makeMiddleware('b', 2, {
          async onComplete() {
            order.push('b');
          },
        }),
      );
      await pipeline.runOnComplete(makeCtx(), { role: 'assistant', content: 'done' } as any);
      expect(order).toEqual(['a', 'b']);
    });
  });

  // ── Group 6: Dry-run mode (3 tests) ────────────────────────────────────

  describe('dry-run mode', () => {
    it('26. dry-run does not apply mutations', async () => {
      const dryPipeline = new MiddlewarePipeline({ dryRun: true });
      dryPipeline.use(
        makeMiddleware('injector', 1, {
          async preModel() {
            return { model: 'gpt-4o' };
          },
        }),
      );
      const { context } = await dryPipeline.runPreModel(makeCtx());
      expect(context.model).toBeUndefined();
    });

    it('27. isDryRun returns config state', () => {
      expect(pipeline.isDryRun()).toBe(false);
      pipeline.updateConfig({ dryRun: true });
      expect(pipeline.isDryRun()).toBe(true);
    });

    it('28. dry-run does not apply postModel mutations', async () => {
      const dryPipeline = new MiddlewarePipeline({ dryRun: true });
      dryPipeline.use(
        makeMiddleware('filter', 1, {
          async postModel() {
            return { response: { role: 'assistant', content: 'filtered' } as any };
          },
        }),
      );
      const { result } = await dryPipeline.runPostModel(makeCtx(), makeResult());
      expect((result.response as any).content).toBe('reply');
    });
  });

  // ── Group 7: Error boundary & timeout (3 tests) ────────────────────────

  describe('error boundary', () => {
    it('29. error boundary re-throws middleware errors', async () => {
      const strictPipeline = new MiddlewarePipeline({
        errorBoundary: true,
        middlewareTimeoutMs: 1000,
      });
      strictPipeline.use(
        makeMiddleware('broken', 1, {
          async preModel() {
            throw new Error('kaboom');
          },
        }),
      );
      await expect(strictPipeline.runPreModel(makeCtx())).rejects.toThrow(/kaboom/);
    });

    it('30. non-error-boundary swallows errors', async () => {
      pipeline.use(
        makeMiddleware('broken', 1, {
          async preModel() {
            throw new Error('oops');
          },
        }),
      );
      const { context } = await pipeline.runPreModel(makeCtx());
      expect(context).toBeDefined();
    });

    it('31. timeout triggers for slow middleware', async () => {
      const fastPipeline = new MiddlewarePipeline({ middlewareTimeoutMs: 50 });
      fastPipeline.use(
        makeMiddleware('slow', 1, {
          async preModel() {
            await new Promise((r) => setTimeout(r, 200));
            return { model: 'too-late' };
          },
        }),
      );
      // Without error boundary, timeout is swallowed
      const { context } = await fastPipeline.runPreModel(makeCtx());
      expect(context.model).toBeUndefined();
    });
  });

  // ── Group 8: Metrics & stats (4 tests) ─────────────────────────────────

  describe('metrics', () => {
    it('32. records metrics for successful calls', async () => {
      pipeline.use(makeMiddleware('ok', 1, { async preModel() {} }));
      await pipeline.runPreModel(makeCtx());
      const metrics = pipeline.getMetrics({ middlewareName: 'ok' });
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.success).toBe(true);
    });

    it('33. records metrics for failed calls', async () => {
      pipeline.use(
        makeMiddleware('fail', 1, {
          async preModel() {
            throw new Error('x');
          },
        }),
      );
      await pipeline.runPreModel(makeCtx());
      const metrics = pipeline.getMetrics({ middlewareName: 'fail' });
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.success).toBe(false);
    });

    it('34. getStats returns aggregate stats', async () => {
      pipeline.use(makeMiddleware('agg', 1, { async preModel() {} }));
      await pipeline.runPreModel(makeCtx());
      await pipeline.runPreModel(makeCtx());
      const stats = pipeline.getStats('agg');
      expect(stats!.totalCalls).toBe(2);
      expect(stats!.successCount).toBe(2);
    });

    it('35. clearMetrics resets all', async () => {
      pipeline.use(makeMiddleware('m', 1, { async preModel() {} }));
      await pipeline.runPreModel(makeCtx());
      pipeline.clearMetrics();
      expect(pipeline.getMetrics()).toHaveLength(0);
      expect(pipeline.getAllStats()).toHaveLength(0);
    });
  });
});
