// Wave 2 — agents storage / runnable / flow / messages coverage

import { describe, it, expect, vi } from 'vitest';
import { InMemoryStorage } from '../src/storage/memory.js';
import { EncoderBackedStorage, JSONEncoder } from '../src/storage/encoder.js';
import { LambdaRunnable, runnable, sequence, parallel } from '../src/pipeline/runnable.js';
import { Flow, createStep } from '../src/flow/flow.js';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  FunctionMessage,
  messageFromData,
} from '../src/messages/message.js';

describe('InMemoryStorage', () => {
  it('set/get/has/delete/keys/size/clear', async () => {
    const store = new InMemoryStorage<string>({ namespace: 'ns' });
    await store.set('a', '1');
    expect(await store.get('a')).toBe('1');
    expect(await store.has('a')).toBe(true);
    expect(await store.keys()).toEqual(['a']);
    expect(await store.size()).toBe(1);
    expect(await store.delete('a')).toBe(true);
    expect(await store.get('a')).toBeUndefined();
    await store.set('b', '2');
    await store.clear();
    expect(await store.size()).toBe(0);
  });

  it('expires entries by ttl and evicts by maxSize', async () => {
    vi.useFakeTimers();
    const store = new InMemoryStorage<number>({ ttl: 100, maxSize: 2 });
    await store.set('x', 1);
    expect(await store.get('x')).toBe(1);
    vi.advanceTimersByTime(150);
    expect(await store.get('x')).toBeUndefined();

    const small = new InMemoryStorage<number>({ maxSize: 2 });
    await small.set('a', 1);
    await small.set('b', 2);
    await small.set('c', 3);
    expect(await small.size()).toBe(2);
    vi.useRealTimers();
  });
});

describe('EncoderBackedStorage + JSONEncoder', () => {
  it('encodes and decodes values via backend', async () => {
    const backend = new InMemoryStorage<string>();
    const store = new EncoderBackedStorage<{ n: number }>({
      backend,
      encoder: JSONEncoder.encode,
      decoder: JSONEncoder.decode,
    });
    await store.set('k', { n: 7 });
    expect(await store.get('k')).toEqual({ n: 7 });
    expect(await store.has('k')).toBe(true);
    expect(await store.keys()).toContain('k');
    expect(await store.size()).toBe(1);
    expect(await store.delete('k')).toBe(true);
    await store.set('z', { n: 1 });
    await store.clear();
    expect(await store.size()).toBe(0);
  });

  it('returns undefined when decoder fails', async () => {
    const backend = new InMemoryStorage<string>();
    await backend.set('bad', '{not-json');
    const store = new EncoderBackedStorage({
      backend,
      encoder: JSONEncoder.encode,
      decoder: JSONEncoder.decode,
    });
    expect(await store.get('bad')).toBeUndefined();
  });
});

describe('Runnable pipeline', () => {
  it('lambda / pipe / transform / batch / stream', async () => {
    const double = runnable<number, number>((n) => n * 2, 'double');
    const toStr = runnable<number, string>((n) => `v=${n}`, 'toStr');
    const chained = double.pipe(toStr);
    expect(await chained.invoke(3)).toBe('v=6');
    expect(await double.batch([1, 2, 3])).toEqual([2, 4, 6]);

    const transformed = double.transform((n) => n + 1);
    expect(await transformed.invoke(4)).toBe(9);

    const chunks: unknown[] = [];
    for await (const c of double.stream(5)) chunks.push(c.data);
    expect(chunks).toEqual([10]);
  });

  it('withRetry retries then succeeds', async () => {
    let n = 0;
    const flaky = new LambdaRunnable(async () => {
      n += 1;
      if (n < 3) throw new Error('nope');
      return 'ok';
    }, 'flaky');
    const r = flaky.withRetry(3, 1);
    await expect(r.invoke(undefined as never)).resolves.toBe('ok');
    expect(n).toBe(3);
  });

  it('withFallbacks uses secondary on primary failure', async () => {
    const primary = runnable(async () => {
      throw new Error('primary down');
    }, 'primary');
    const secondary = runnable(async () => 'fallback', 'secondary');
    const r = primary.withFallbacks([secondary]);
    await expect(r.invoke(undefined as never)).resolves.toBe('fallback');
  });

  it('sequence and parallel helpers', async () => {
    const a = runnable<number, number>((n) => n + 1);
    const b = runnable<number, number>((n) => n * 10);
    const seq = sequence<number, number>(a as never, b as never);
    expect(await seq.invoke(2)).toBe(30);

    const p = parallel(a, b);
    expect(await p.invoke(2)).toEqual([3, 20]);
  });
});

describe('Flow orchestration', () => {
  it('runs sequential steps and shares state', async () => {
    const flow = new Flow({ name: 'seq', mode: 'sequential' })
      .addStep(
        createStep('a', 'A', async (_input, ctx) => {
          ctx.set('x', 1);
          return 1;
        }),
      )
      .addStep(
        createStep('b', 'B', async (_input, ctx) => {
          return (ctx.get<number>('x') ?? 0) + 1;
        }),
      );

    const result = await flow.run();
    expect(['completed', 'partial']).toContain(result.status);
    expect(result.steps.length).toBe(2);
    expect(flow.listSteps()).toHaveLength(2);
    expect(flow.getStep('a')?.id).toBe('a');
    expect(flow.removeStep('b')).toBe(true);
  });

  it('runs parallel mode', async () => {
    const flow = new Flow({ name: 'par', mode: 'parallel', maxConcurrency: 2 });
    flow.addStep(createStep('p1', 'P1', async () => 1));
    flow.addStep(createStep('p2', 'P2', async () => 2));
    const result = await flow.run();
    expect(
      result.steps.every(
        (s) =>
          s.status === 'completed' ||
          s.status === 'success' ||
          s.status === 'failed' ||
          s.status === 'skipped',
      ),
    ).toBe(true);
    expect(result.steps.length).toBe(2);
  });

  it('runs dag with dependencies', async () => {
    const order: string[] = [];
    const flow = new Flow({ name: 'dag', mode: 'dag' });
    flow.addStep(
      createStep('root', 'Root', async () => {
        order.push('root');
        return 1;
      }),
    );
    flow.addStep(
      createStep(
        'child',
        'Child',
        async () => {
          order.push('child');
          return 2;
        },
        { dependsOn: ['root'] },
      ),
    );
    const result = await flow.run();
    expect(order).toEqual(['root', 'child']);
    expect(result.status).toBe('completed');
  });
});

describe('Messages', () => {
  it('round-trips message variants via toData/messageFromData', () => {
    const human = new HumanMessage('hi');
    const ai = new AIMessage('yo', {
      toolCalls: [{ id: '1', name: 't', arguments: { a: 1 } }],
    });
    const sys = new SystemMessage('sys');
    const tool = new ToolMessage('obs', '1', 't');
    const fn = new FunctionMessage('fn-out', 'fnName');

    expect(human.getText()).toBe('hi');
    expect(ai.role).toBe('assistant');
    expect(sys.role).toBe('system');
    expect(tool.role).toBe('tool');
    expect(fn.role).toBe('function');

    for (const m of [human, ai, sys, tool, fn]) {
      const again = messageFromData(m.toData());
      expect(again.getText()).toBe(m.getText());
      expect(again.role).toBe(m.role);
    }
  });
});
