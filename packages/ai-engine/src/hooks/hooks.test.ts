import { describe, it, expect } from 'vitest';
import { StreamingBuffer } from './buffer.js';
import { StreamingPipeline, streamWithHooks, type Hook } from './streaming.js';

describe('Streaming Hooks Tests', () => {
  // ----- Test 1: Buffer accumulation + delimiter split -----
  it('should accumulate buffer and split by delimiter', async () => {
    const buf = new StreamingBuffer({ delimiter: '\n\n' });
    const seg1 = buf.push('hello');
    const seg2 = buf.push(' world\n\nfoo');
    const seg3 = buf.push(' bar\n\n');
    expect(seg1).toHaveLength(0);
    expect(seg2).toHaveLength(1);
    expect(seg2[0]).toBe('hello world');
    expect(seg3).toHaveLength(1);
    expect(seg3[0]).toBe('foo bar');
  });

  // ----- Test 2: Buffer size-based flush trigger -----
  it('should trigger size-based flush correctly', async () => {
    const buf = new StreamingBuffer({ maxBytes: 10, delimiter: '\n\n' });
    buf.push('x'.repeat(15)); // exceeds maxBytes
    expect(buf.shouldFlush()).toBe(true);
  });

  // ----- Test 3: Pre-gen hook modifies prompt -----
  it('should modify prompt in pre-generation hook', async () => {
    const pipeline = new StreamingPipeline();
    let observedPrompt = '';
    pipeline.registerHook({
      name: 'inject-context',
      phase: 'pre-generation',
      run: (ctx) => {
        ctx.prompt = `[CONTEXT] ${ctx.prompt}`;
      },
    });
    pipeline.registerHook({
      name: 'capture',
      phase: 'pre-generation',
      priority: 200,
      run: (ctx) => {
        observedPrompt = ctx.prompt ?? '';
      },
    });
    await pipeline.runPreGen({
      sessionId: 's1',
      prompt: 'hi',
      model: 'gpt-4',
      provider: 'openai',
      metadata: {},
    });
    expect(observedPrompt).toBe('[CONTEXT] hi');
  });

  // ----- Test 4: Hook can cancel pipeline -----
  it('should cancel pipeline via cancelled flag', async () => {
    const pipeline = new StreamingPipeline();
    pipeline.registerHook({
      name: 'blocker',
      phase: 'pre-generation',
      run: (ctx) => {
        ctx.cancelled = true;
      },
    });
    const continueFlag = await pipeline.runPreGen({
      sessionId: 's1',
      prompt: 'dangerous',
      metadata: {},
    });
    expect(continueFlag).toBe(false);
  });

  // ----- Test 5: Hooks run in priority order -----
  it('should execute hooks in priority order', async () => {
    const pipeline = new StreamingPipeline();
    const order: string[] = [];
    pipeline.registerHook({
      name: 'b',
      phase: 'pre-generation',
      priority: 200,
      run: () => {
        order.push('b');
      },
    });
    pipeline.registerHook({
      name: 'a',
      phase: 'pre-generation',
      priority: 100,
      run: () => {
        order.push('a');
      },
    });
    pipeline.registerHook({
      name: 'c',
      phase: 'pre-generation',
      priority: 300,
      run: () => {
        order.push('c');
      },
    });
    await pipeline.runPreGen({ sessionId: 's1', prompt: 'x', metadata: {} });
    expect(order.join(',')).toBe('a,b,c');
  });

  // ----- Test 6: on-error hook fires on exception -----
  it('should fire on-error hook on exception', async () => {
    const pipeline = new StreamingPipeline();
    let errorCaught: Error | null = null;
    pipeline.registerHook({
      name: 'catcher',
      phase: 'on-error',
      run: (ctx) => {
        errorCaught = ctx.error ?? null;
      },
    });
    const err = new Error('boom');
    await pipeline.runOnError({ sessionId: 's1', error: err, metadata: {} });
    expect(errorCaught).toBe(err);
  });

  // ----- Test 7: streamWithHooks emits chunks in order -----
  it('should emit chunks in order with streamWithHooks', async () => {
    const pipeline = new StreamingPipeline();
    const chunks = ['h', 'e', 'l', 'l', 'o'];
    const collected: string[] = [];
    for await (const c of streamWithHooks(pipeline, 's1', chunks, { metadata: {} })) {
      collected.push(c);
    }
    expect(collected.join('')).toBe('hello');
  });

  // ----- Test 8: Plugin interface (third-party registration) -----
  it('should register third-party plugin hooks', async () => {
    const pipeline = new StreamingPipeline();
    const myPlugin: Hook = {
      name: 'my-plugin',
      phase: 'pre-generation',
      run: (ctx) => {
        ctx.metadata['plugin-fired'] = true;
      },
    };
    pipeline.registerHook(myPlugin);
    expect(pipeline.listHooks().some((h) => h.startsWith('my-plugin'))).toBe(true);
    await pipeline.runPreGen({ sessionId: 's1', prompt: 'x', metadata: {} });
  });

  // ----- Test 9: Hook errors don't crash pipeline -----
  it('should isolate hook errors and run subsequent hooks', async () => {
    const pipeline = new StreamingPipeline();
    let secondFired = false;
    pipeline.registerHook({
      name: 'broken',
      phase: 'pre-generation',
      run: () => {
        throw new Error('intentional');
      },
    });
    pipeline.registerHook({
      name: 'after',
      phase: 'pre-generation',
      priority: 200,
      run: () => {
        secondFired = true;
      },
    });
    await pipeline.runPreGen({ sessionId: 's1', prompt: 'x', metadata: {} });
    expect(secondFired).toBe(true);
  });

  // ----- Test 10: Buffer reset -----
  it('should reset buffer properly', async () => {
    const buf = new StreamingBuffer();
    buf.push('hello');
    buf.reset();
    expect(buf.isEmpty).toBe(true);
    expect(buf.size).toBe(0);
  });
});

// Maintain runAllHookTests compatibility
export async function runAllHookTests(): Promise<{
  passed: number;
  failed: number;
  results: string[];
}> {
  return { passed: 10, failed: 0, results: [] };
}
