import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LongitudinalStore } from './longitudinal.js';
import { finalizeEval, defaultAdapter } from './runner.js';
import { createInternalSuite } from './suites.js';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), 'evals-long-'));
  return { dir, store: new LongitudinalStore({ dbPath: join(dir, 'history.db') }) };
}

describe('LongitudinalStore', () => {
  it('stores, aggregates and compares versions', async () => {
    const { dir, store } = freshStore();
    try {
      const suite = createInternalSuite();
      const task = must(suite.tasks[0]);
      const runV1 = finalizeEval(
        suite.name,
        await defaultAdapter({ ...task, id: task.id }),
        '1.0.0',
      );
      const runV2 = finalizeEval(
        suite.name,
        await defaultAdapter({ ...task, id: task.id }),
        '1.1.0',
      );
      store.insertRun(runV1);
      store.insertRun(runV2);

      expect(store.averageScore(suite.name, '1.0.0')).not.toBeNull();
      const delta = store.compare(suite.name, '1.0.0', '1.1.0');
      expect(delta).not.toBeNull();
      expect(delta?.suite).toBe(suite.name);
      expect(delta?.candidateScore).toBe(delta?.baselineScore);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null when a version has no history', async () => {
    const { dir, store } = freshStore();
    try {
      const suite = createInternalSuite();
      const run = finalizeEval(suite.name, await defaultAdapter(must(suite.tasks[0])), '1.0.0');
      store.insertRun(run);
      expect(store.averageScore(suite.name, '9.9.9')).toBeNull();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
