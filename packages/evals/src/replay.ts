// ==============================================================================
// GHITA CODING AGENT - Evals: trajectory replay
// ==============================================================================

import type { EvalRun, EvalStep } from './types.js';

export interface StepHandler {
  (step: EvalStep): Promise<string>;
}

export interface ReplayResult {
  ok: boolean;
  steps: Array<{ tool: string; output: string }>;
  errors: string[];
}

/**
 * Deterministic trajectory replay: re-executes the recorded tool steps through
 * a caller-provided handler without needing the model again. Used to verify
 * reproducibility of a run after it has been recorded.
 */
export async function replayTrajectory(
  run: Pick<EvalRun, 'steps'>,
  handler: StepHandler,
): Promise<ReplayResult> {
  const errors: string[] = [];
  const executed: Array<{ tool: string; output: string }> = [];
  let ok = true;
  for (const step of run.steps) {
    try {
      const output = await handler(step);
      executed.push({ tool: step.tool, output });
    } catch (err) {
      ok = false;
      errors.push(`${step.tool}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { ok, steps: executed, errors };
}

/** Replay against recorded fixture answers (offline, deterministic). */
export function replayOffline(
  run: Pick<EvalRun, 'steps'>,
  answers: ReadonlyMap<string, string>,
): ReplayResult {
  const executed: Array<{ tool: string; output: string }> = [];
  const errors: string[] = [];
  let ok = true;
  for (const step of run.steps) {
    const key = step.tool;
    const answer = answers.get(key) ?? '';
    if (answers.has(key)) {
      executed.push({ tool: key, output: answer });
    } else {
      ok = false;
      errors.push(`no recorded answer for step "${key}"`);
    }
  }
  return { ok, steps: executed, errors };
}
