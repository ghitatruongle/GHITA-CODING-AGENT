// ==============================================================================
// Wave 2b — filesystem storage + workflow engine
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemStorage } from '../src/storage/filesystem.js';
import { WorkflowAgent } from '../src/workflow/engine.js';

describe('FileSystemStorage', () => {
  it('persists values on disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fs-store-'));
    const store = new FileSystemStorage<string>({ basePath: dir });
    await store.set('hello world', 'value');
    expect(await store.get('hello world')).toBe('value');
    expect(await store.has('hello world')).toBe(true);
    const keys = await store.keys();
    expect(keys.length).toBe(1);
    expect(await store.size()).toBe(1);
    expect(await store.delete('hello world')).toBe(true);
    expect(await store.get('hello world')).toBeUndefined();
    await store.set('a', '1');
    await store.clear();
    expect(await store.size()).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('WorkflowAgent', () => {
  it('runs steps with dependencies and callbacks', async () => {
    const order: string[] = [];
    const agent = new WorkflowAgent('demo', { state: { seed: 1 } });
    agent
      .addStep({
        id: 'a',
        name: 'A',
        execute: async (state) => {
          order.push('a');
          return (state.seed as number) + 1;
        },
      })
      .addStep({
        id: 'b',
        name: 'B',
        dependsOn: ['a'],
        execute: async (state) => {
          order.push('b');
          return (state.a as number) * 2;
        },
      });

    const events: string[] = [];
    const result = await agent.run({
      onStart: () => {
        events.push('start');
      },
      onStepStart: (id) => {
        events.push(`start:${id}`);
      },
      onStepFinish: (id) => {
        events.push(`finish:${id}`);
      },
      onFinish: () => {
        events.push('finish');
      },
    });

    expect(order).toEqual(['a', 'b']);
    expect(result.a).toBe(2);
    expect(result.b).toBe(4);
    expect(events[0]).toBe('start');
    expect(events.at(-1)).toBe('finish');
    expect(agent.getState().b).toBe(4);
    agent.setState({ reset: true });
    expect(agent.getState()).toEqual({ reset: true });
  });

  it('throws on missing dependency', async () => {
    const agent = new WorkflowAgent('bad');
    agent.addStep({
      id: 'x',
      name: 'X',
      dependsOn: ['missing'],
      execute: async () => 1,
    });
    await expect(agent.run()).rejects.toThrow(/does not exist/);
  });

  it('detects circular dependencies', async () => {
    const agent = new WorkflowAgent('cycle');
    agent.addStep({
      id: 'a',
      name: 'A',
      dependsOn: ['b'],
      execute: async () => 1,
    });
    agent.addStep({
      id: 'b',
      name: 'B',
      dependsOn: ['a'],
      execute: async () => 2,
    });
    await expect(agent.run()).rejects.toThrow(/Circular dependency/);
  });
});
