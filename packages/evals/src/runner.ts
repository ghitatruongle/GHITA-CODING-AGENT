// ==============================================================================
// GHITA CODING AGENT - Evals: runner
// ==============================================================================

import { randomUUID } from 'node:crypto';
import type { AgentResult, EvalRun, EvalSuite, EvalTask, RunOptions } from './types.js';
import { EVALS_VERSION } from './types.js';
import { computeRunScore } from './scoring.js';

export interface RunSummary {
  suite: string;
  total: number;
  passedCount: number;
  failedCount: number;
  averageScore: number;
}

/** Deterministic fixture adapter: returns the task's fixture answer (offline CI). */
export async function defaultAdapter(task: EvalTask): Promise<AgentResult> {
  const fixture = task.fixture ?? '';
  return {
    task,
    output: fixture,
    artifacts: [],
    trajectory: { steps: [{ tool: 'fixture.answer', args: { taskId: task.id } }] },
    durationMs: 1,
  };
}

/** Finalize an AgentResult into a scored EvalRun. */
export function finalizeEval(suite: string, adapterResult: AgentResult, version: string): EvalRun {
  const outcome = computeRunScore({
    expected: adapterResult.task.expected,
    output: adapterResult.output,
    artifacts: adapterResult.artifacts ?? [],
    steps: adapterResult.trajectory?.steps ?? [],
    passed: adapterResult.output.trim().length > 0,
  });
  return {
    ...outcome,
    status: outcome.passed ? 'passed' : 'failed',
    runId: randomUUID(),
    suite,
    task: adapterResult.task,
    version,
    startedAt: new Date().toISOString(),
    durationMs: adapterResult.durationMs ?? 0,
    steps: adapterResult.trajectory?.steps ?? [],
    trajectoryFingerprint: hashSteps(adapterResult.trajectory?.steps ?? []),
  };
}

/** Run all tasks of a suite through an adapter. */
export async function runSuite(
  suite: EvalSuite,
  options: RunOptions,
): Promise<{ runs: EvalRun[]; summary: RunSummary }> {
  const adapter = options.adapter ?? defaultAdapter;
  const filter: ReadonlyArray<string> = options.taskFilter ?? [];

  const runs: EvalRun[] = [];
  for (const task of suite.tasks) {
    if (filter.length > 0 && !filter.includes(task.id)) continue;
    const result = await adapter(task);
    runs.push(finalizeEval(suite.name, result, options.version ?? EVALS_VERSION));
  }
  return { runs, summary: summarize(runs, suite.name) };
}

export function summarize(runs: readonly EvalRun[], suite: string): RunSummary {
  const passedCount = runs.filter((r) => r.passed).length;
  const averageScore =
    runs.length === 0 ? 0 : Math.round(runs.reduce((s, r) => s + r.score, 0) / runs.length);
  return {
    suite,
    total: runs.length,
    passedCount,
    failedCount: runs.length - passedCount,
    averageScore,
  };
}

function hashSteps(steps: readonly unknown[]): string {
  let h = 1;
  for (const s of steps) {
    const str = typeof s === 'string' ? s : JSON.stringify(s);
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
