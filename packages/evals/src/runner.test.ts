import { describe, it, expect } from 'vitest';
import { finalizeEval, runSuite, defaultAdapter, summarize } from './runner.js';
import { createInternalSuite } from './suites.js';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

describe('runSuite', () => {
  it('runs a suite with the fixture adapter and produces scored runs', async () => {
    const suite = createInternalSuite();
    const { runs, summary } = await runSuite(suite, { suite: suite.name });
    expect(summary.total).toBe(suite.tasks.length);
    expect(summary.total).toBeGreaterThanOrEqual(20);
    expect(runs.every((r) => r.runId.length > 0)).toBe(true);
    expect(runs.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
  });

  it('filters by taskFilter', async () => {
    const suite = createInternalSuite();
    const { runs } = await runSuite(suite, { suite: suite.name, taskFilter: ['edit-fix-typo'] });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.task.id).toBe('edit-fix-typo');
  });

  it('computes trajectory fingerprint deterministically', async () => {
    const a = finalizeEval(
      's',
      await defaultAdapter(must(createInternalSuite().tasks[0])),
      '1.0.0',
    );
    const b = finalizeEval(
      's',
      await defaultAdapter(must(createInternalSuite().tasks[0])),
      '1.0.0',
    );
    expect(a.trajectoryFingerprint).toBe(b.trajectoryFingerprint);
  });
});

describe('summarize', () => {
  it('computes aggregates for an empty run set', () => {
    const s = summarize([], 'x');
    expect(s.total).toBe(0);
    expect(s.averageScore).toBe(0);
  });
});
