// ==============================================================================
// GHITA CODING AGENT - Agents v1.1.0 Track 5 P36: lifecycle API
// ==============================================================================
// Unified launch/pause/resume/enumerate for agent runs (12-factor + oh-my-pi
// pattern). Bridges to the run-journal so states are consistent across the
// desktop app and mobile remote control.
// ==============================================================================

export type RunState = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';

export interface ManagedRun {
  id: string;
  name: string;
  state: RunState;
  startedAt: number;
  updatedAt: number;
  progress?: number;
  error?: string;
  /** Bridge metadata (journal path / remote session id). */
  meta: Record<string, unknown>;
}

export interface RunExecutor {
  (run: ManagedRun): Promise<void>;
}

export interface LifecycleHooks {
  onStateChange?: (run: ManagedRun, previous: RunState) => void;
}

export class AgentLifecycleManager {
  private runs = new Map<string, ManagedRun>();
  private executors = new Map<string, RunExecutor>();
  private readonly hooks: LifecycleHooks = {};

  constructor(hooks: LifecycleHooks = {}) {
    this.hooks = hooks;
  }

  /** Launch a new run. */
  launch(name: string, executor: RunExecutor, meta: Record<string, unknown> = {}): ManagedRun {
    const run: ManagedRun = {
      id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      state: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      meta,
    };
    this.runs.set(run.id, run);
    this.executors.set(run.id, executor);
    this.hooks.onStateChange?.(run, 'idle');

    void executor(run)
      .then(() => this.transition(run.id, 'completed'))
      .catch((err) => {
        const current = this.runs.get(run.id);
        if (current && current.state === 'running') {
          current.error = err instanceof Error ? err.message : String(err);
          this.transition(run.id, 'error');
        }
      });
    return run;
  }

  pause(id: string): boolean {
    const run = this.runs.get(id);
    if (!run || run.state !== 'running') return false;
    return this.transition(id, 'paused');
  }

  /** Resume a paused run by re-running its executor (idempotent). */
  resume(id: string): boolean {
    const run = this.runs.get(id);
    const executor = this.executors.get(id);
    if (!run || !executor) return false;
    if (run.state !== 'paused') return false;
    this.transition(id, 'running');
    void executor(run)
      .then(() => this.transition(id, 'completed'))
      .catch(() => this.transition(id, 'error'));
    return true;
  }

  cancel(id: string): boolean {
    const run = this.runs.get(id);
    if (!run) return false;
    if (run.state === 'completed' || run.state === 'cancelled') return false;
    return this.transition(id, 'cancelled');
  }

  get(id: string): ManagedRun | undefined {
    return this.runs.get(id);
  }

  enumerate(state?: RunState): ManagedRun[] {
    const values = [...this.runs.values()];
    return state ? values.filter((r) => r.state === state) : values;
  }

  count(): Record<RunState, number> {
    const out: Record<RunState, number> = {
      idle: 0,
      running: 0,
      paused: 0,
      completed: 0,
      error: 0,
      cancelled: 0,
    };
    for (const r of this.runs.values()) out[r.state] += 1;
    return out;
  }

  clear(): void {
    this.runs.clear();
    this.executors.clear();
  }

  private transition(id: string, next: RunState): boolean {
    const run = this.runs.get(id);
    if (!run) return false;
    const previous = run.state;
    run.state = next;
    run.updatedAt = Date.now();
    if (next === 'completed') run.progress = 1;
    this.hooks.onStateChange?.(run, previous);
    return true;
  }
}
