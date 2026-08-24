//
// Covers the audit-driven concurrency fix: instead of rejecting spawn
// requests immediately when `maxConcurrency` is reached, the spawner
// now queues them in FIFO order and drains the queue as in-flight
// agents finish. The downstream consumers therefore see no dropped
// work and head-of-line blocking is bounded by the depth of the queue
// rather than by single-call rejection.
//
// We mock `AgentManager` with a minimal in-memory stub so the test
// runs in <100ms without spinning real agents.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubagentSpawner } from '../src/subagent/spawner.js';
import type { AgentManager } from '../src/index.js';
import type { SubagentSpawnInput, SubagentSpawnResult } from '../src/subagent/types.js';

const delays = new Map<string, number>();

function makeManager(): AgentManager {
  const specs = new Map<
    string,
    {
      id: string;
      role: string;
      delayMs?: number;
    }
  >();
  const mgr = {
    create: vi.fn(
      (spec: {
        name: string;
        role: string;
        description?: string;
        skills?: string[];
        model?: string;
        systemPrompt?: string;
      }) => {
        const id = spec.name;
        const delayMs = delays.get(id) ?? 5;
        specs.set(id, { id, role: spec.role, delayMs });
        return { id, role: spec.role };
      },
    ),
    assignTask: vi.fn(async (id: string, task: string) => {
      const spec = specs.get(id);
      const delay = spec?.delayMs ?? 5;
      await new Promise((r) => setTimeout(r, delay));
      return {
        id: `task-${id}`,
        agentId: id,
        description: task,
        status: 'completed',
        result: `done-${id}`,
        durationMs: delay,
      };
    }),
    remove: vi.fn((_id: string) => undefined),
  } as unknown as AgentManager;
  return mgr;
}

const baseInput = (n: number): SubagentSpawnInput => ({
  name: `a-${n}`,
  role: 'tester' as any,
  description: `desc ${n}`,
  task: `task ${n}`,
});

describe('Audit Fix 2.6 — Spawner queues requests when at capacity', () => {
  beforeEach(() => {
    delays.clear();
  });

  it('queues and drains requests in FIFO order', async () => {
    const manager = makeManager();
    const spawner = new SubagentSpawner(manager, { maxConcurrency: 2, defaultTimeoutMs: 5_000 });

    // Fire 6 concurrent spawn requests with concurrency=2 — only 2 run
    // at a time, the rest should be queued. After all complete, the
    // order of `done-*` results should reflect FIFO dispatch (older
    // ids ran first).
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => spawner.spawn(baseInput(i + 1))),
    );

    expect(results).toHaveLength(6);
    for (const r of results) {
      expect((r as SubagentSpawnResult).status).toBe('completed');
      expect((r as SubagentSpawnResult).result).toMatch(/^done-a-\d+$/);
    }
    // queuedCount should drop back to 0 once the queue is drained.
    expect(spawner.queuedCount).toBe(0);
  });

  it('queuedCount grows as requests pile up', async () => {
    const manager = makeManager();
    const spawner = new SubagentSpawner(manager, { maxConcurrency: 1 });

    // Start one slow request to occupy the only slot.
    delays.set('a-0', 30);
    const slow = spawner.spawn(baseInput(0));
    // Give the microtask queue a tick to register the in-flight agent.
    await new Promise((r) => setTimeout(r, 5));
    expect(spawner.queuedCount).toBe(0);

    // Now enqueue 3 more — they should sit in the queue while the
    // first one is still running.
    const queued = [
      spawner.spawn(baseInput(1)),
      spawner.spawn(baseInput(2)),
      spawner.spawn(baseInput(3)),
    ];
    // Microtask flush so spawn() sees the queue.
    await new Promise((r) => setTimeout(r, 0));
    expect(spawner.queuedCount).toBe(3);

    await Promise.all([slow, ...queued]);
    expect(spawner.queuedCount).toBe(0);
  });

  it('does not reject requests with an error when at capacity', async () => {
    const manager = makeManager();
    const spawner = new SubagentSpawner(manager, { maxConcurrency: 1 });

    // The old behaviour: spawn() returned a `{ status: 'failed', error: 'Concurrency limit reached' }`
    // result when capacity was reached. Verify that is no longer the
    // case — the result should ultimately be `completed`.
    delays.set('a-0', 10);
    const inflight = spawner.spawn(baseInput(0));
    const next = spawner.spawn(baseInput(1));

    const [a, b] = await Promise.all([inflight, next]);
    expect((a as SubagentSpawnResult).status).toBe('completed');
    expect((b as SubagentSpawnResult).status).toBe('completed');
    // Neither should report a "Concurrency limit reached" error.
    for (const r of [a, b] as SubagentSpawnResult[]) {
      expect(r.error ?? '').not.toMatch(/Concurrency limit reached/);
    }
  });
});
