/* eslint-disable @typescript-eslint/no-non-null-assertion */
// ==============================================================================
// GHITA CODING AGENT - Advanced Workflow Engine
// Phase 16 (Update 0.0.3 beta2): retry, rollback, conditional, parallel, timeout
// ==============================================================================

// ----------------------------------------------------------------------------
// Advanced step definition
// ----------------------------------------------------------------------------

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'rolled-back';

export interface RetryPolicy {
  /** Maximum total attempts (including the first). Must be >= 1. */
  maxAttempts: number;
  /** Initial backoff in ms; doubled on each retry. */
  backoffMs: number;
  /** Cap for the backoff (prevents runaway). */
  maxBackoffMs?: number;
  /** Only retry when the thrown error matches this predicate. */
  shouldRetry?: (err: Error) => boolean;
}

export interface StepContext {
  stepId: string;
  state: Record<string, unknown>;
  attempt: number;
  signal: AbortSignal;
}

export interface AdvancedWorkflowStep {
  /** Unique step id within the workflow. */
  id: string;
  /** Human-readable name shown in callbacks. */
  name: string;
  /** Optional dependencies; all of these must complete before this step. */
  dependsOn?: string[];
  /** Abort if not done within this many ms. */
  timeoutMs?: number;
  /** Retry policy for transient failures. */
  retry?: RetryPolicy;
  /** Optional rollback handler called on permanent failure. */
  rollback?: (state: Record<string, unknown>, err: Error) => Promise<void>;
  /** When this returns false, the step is skipped (still marked as success). */
  when?: (state: Record<string, unknown>) => boolean | Promise<boolean>;
  /** Step body. Receives the per-step context with attempt number and AbortSignal. */
  execute: (state: Record<string, unknown>, ctx: Omit<StepContext, 'state'>) => Promise<unknown>;
}

export interface AdvancedWorkflowCallbacks {
  onStart?: (workflowName: string, initialState: Record<string, unknown>) => void | Promise<void>;
  onStepStart?: (stepId: string, attempt: number) => void | Promise<void>;
  onStepRetry?: (
    stepId: string,
    attempt: number,
    err: Error,
    nextBackoffMs: number,
  ) => void | Promise<void>;
  onStepSkip?: (stepId: string, reason: string) => void | Promise<void>;
  onStepRollback?: (stepId: string, err: Error) => void | Promise<void>;
  onStepFinish?: (
    stepId: string,
    status: StepStatus,
    result: unknown,
    durationMs: number,
  ) => void | Promise<void>;
  onFinish?: (
    state: Record<string, unknown>,
    durationMs: number,
    status: 'success' | 'failed',
  ) => void | Promise<void>;
  onError?: (stepId: string | null, error: Error) => void | Promise<void>;
}

export interface AdvancedWorkflowOptions {
  /** Abort the entire workflow from the outside. */
  signal?: AbortSignal;
  /** When true, continue executing remaining steps even if one fails. */
  continueOnError?: boolean;
  /** When true, skip rollback for steps that did not execute (status !== success). */
  rollbackOnlyExecuted?: boolean;
  /** Time budget for the whole workflow in ms. */
  overallTimeoutMs?: number;
}

// ----------------------------------------------------------------------------
// Result / Status types
// ----------------------------------------------------------------------------

export interface WorkflowRunResult {
  state: Record<string, unknown>;
  status: 'success' | 'failed' | 'aborted';
  durationMs: number;
  stepResults: Record<
    string,
    { status: StepStatus; result?: unknown; error?: string; durationMs: number }
  >;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

function nextBackoff(attempt: number, policy: RetryPolicy): number {
  const base = policy.backoffMs * Math.pow(2, attempt - 1);
  return Math.min(base, policy.maxBackoffMs ?? 30_000);
}

// ----------------------------------------------------------------------------
// Engine
// ----------------------------------------------------------------------------

export class AdvancedWorkflowEngine {
  readonly name: string;
  private readonly steps: AdvancedWorkflowStep[];
  private status = new Map<string, StepStatus>();
  private stepResults: WorkflowRunResult['stepResults'] = {};

  constructor(name: string, steps: AdvancedWorkflowStep[]) {
    this.name = name;
    this.steps = steps;
    for (const s of steps) this.status.set(s.id, 'pending');
  }

  async run(
    initialState: Record<string, unknown> = {},
    callbacks: AdvancedWorkflowCallbacks = {},
    options: AdvancedWorkflowOptions = {},
  ): Promise<WorkflowRunResult> {
    const startTime = Date.now();
    const state: Record<string, unknown> = { ...initialState };
    const overallController = new AbortController();
    if (options.signal) {
      options.signal.addEventListener('abort', () => overallController.abort(), { once: true });
    }
    let overallTimer: ReturnType<typeof setTimeout> | undefined;
    if (options.overallTimeoutMs) {
      overallTimer = setTimeout(() => overallController.abort(), options.overallTimeoutMs);
    }

    try {
      await callbacks.onStart?.(this.name, state);
      this.stepResults = {};
      const executed = new Set<string>();
      const inProgress = new Set<string>();

      const tryStep = async (step: AdvancedWorkflowStep): Promise<void> => {
        if (overallController.signal.aborted) throw new Error('workflow aborted');
        if (executed.has(step.id)) return;
        if (inProgress.has(step.id)) {
          throw new Error(`Circular dependency detected at step ${step.id}`);
        }
        inProgress.add(step.id);
        try {
          await runStep(step);
        } finally {
          // RESILIENCE (audit fix 2.4): always clear `inProgress` even on
          // throw, otherwise a failed step leaves the marker in the set
          // and the next retry run reports a spurious "Circular
          // dependency detected" error. The original code only cleared
          // inProgress inside the conditional-skip branch.
          inProgress.delete(step.id);
        }
      };

      const runStep = async (step: AdvancedWorkflowStep): Promise<void> => {
        for (const depId of step.dependsOn ?? []) {
          const depStep = this.steps.find((s) => s.id === depId);
          if (depStep) await tryStep(depStep);
        }

        // Conditional skip
        if (step.when) {
          const ok = await step.when(state);
          if (!ok) {
            this.status.set(step.id, 'skipped');
            this.stepResults[step.id] = { status: 'skipped', durationMs: 0 };
            await callbacks.onStepSkip?.(step.id, 'when() returned false');
            await callbacks.onStepFinish?.(step.id, 'skipped', undefined, 0);
            executed.add(step.id);
            return;
          }
        }

        const maxAttempts = step.retry?.maxAttempts ?? 1;
        let attempt = 0;
        let lastError: Error | null = null;

        while (attempt < maxAttempts) {
          attempt += 1;
          this.status.set(step.id, 'running');
          const stepStart = Date.now();
          const stepController = new AbortController();
          const onAbort = () => stepController.abort();
          // Hoisted so `finally` can release the timer on every exit path.
          let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
          overallController.signal.addEventListener('abort', onAbort, { once: true });
          await callbacks.onStepStart?.(step.id, attempt);

          try {
            const timeoutMs = step.timeoutMs;
            const runOnce = step.execute(state, {
              stepId: step.id,
              attempt,
              signal: stepController.signal,
            });
            const value = timeoutMs
              ? await Promise.race([
                  runOnce,
                  new Promise<never>((_, reject) => {
                    // RESILIENCE (audit fix 2.3): keep a handle on the
                    // timer so we can clear it once the step resolves
                    // successfully OR fails. Previously the timer kept
                    // running in the background and leaked CPU/RAM for
                    // every step that finished before its timeout.
                    timeoutHandle = setTimeout(() => {
                      stepController.abort();
                      reject(new Error(`step ${step.id} timed out after ${timeoutMs}ms`));
                    }, timeoutMs);
                  }),
                ])
              : await runOnce;
            state[step.id] = value;
            const dur = Date.now() - stepStart;
            this.status.set(step.id, 'success');
            this.stepResults[step.id] = { status: 'success', result: value, durationMs: dur };
            await callbacks.onStepFinish?.(step.id, 'success', value, dur);
            lastError = null;
            break;
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            lastError = error;
            const dur = Date.now() - stepStart;
            this.stepResults[step.id] = { status: 'failed', error: error.message, durationMs: dur };
            const retryable = step.retry?.shouldRetry ? step.retry.shouldRetry(error) : true;
            if (attempt < maxAttempts && retryable && !overallController.signal.aborted) {
              const backoff = nextBackoff(attempt, step.retry!);
              await callbacks.onStepRetry?.(step.id, attempt, error, backoff);
              await sleep(backoff, overallController.signal);
              continue;
            }
            this.status.set(step.id, 'failed');
            await callbacks.onStepFinish?.(step.id, 'failed', undefined, dur);
            throw error;
          } finally {
            // RESILIENCE (audit fix 2.3): always release the timer —
            // whether the step succeeded, failed, or was retried — so
            // the rejected Promise + setTimeout closure is GC-eligible.
            if (timeoutHandle !== null) {
              clearTimeout(timeoutHandle);
              timeoutHandle = null;
            }
            overallController.signal.removeEventListener('abort', onAbort);
          }
        }

        executed.add(step.id);
        void lastError; // silence unused
      };

      let workflowError: Error | null = null;
      for (const step of this.steps) {
        try {
          await tryStep(step);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          workflowError = error;
          if (step.rollback) {
            try {
              await step.rollback(state, error);
              await callbacks.onStepRollback?.(step.id, error);
            } catch (rbErr) {
              const e = rbErr instanceof Error ? rbErr : new Error(String(rbErr));
              await callbacks.onError?.(step.id, e);
            }
          }
          if (!options.continueOnError) break;
        }
      }

      const status: 'success' | 'failed' = workflowError ? 'failed' : 'success';
      const durationMs = Date.now() - startTime;
      await callbacks.onFinish?.(state, durationMs, status);
      const finalStatus: WorkflowRunResult['status'] = overallController.signal.aborted
        ? 'aborted'
        : status;
      return { state, status: finalStatus, durationMs, stepResults: this.stepResults };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await callbacks.onError?.(null, error);
      throw error;
    } finally {
      if (overallTimer) clearTimeout(overallTimer);
    }
  }
}
