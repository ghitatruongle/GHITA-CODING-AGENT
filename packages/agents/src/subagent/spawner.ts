// ==============================================================================
// GHITA CODING AGENT - Sub-Agent Spawner (Phase 6)
// Isolated context spawning with concurrency control, timeouts & lifecycle hooks
// ==============================================================================

import type { AgentManager } from '../index.js';
import type {
  SubagentSpawnInput,
  SubagentSpawnResult,
  SubagentState,
  SpawnerConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSubId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// SubagentSpawner
// ---------------------------------------------------------------------------

export class SubagentSpawner {
  private readonly activeSubagents = new Map<string, SubagentState>();
  private readonly runningIds = new Set<string>(); // agent ids currently executing
  private readonly config: Required<
    Pick<SpawnerConfig, 'maxConcurrency' | 'defaultTimeoutMs' | 'maxStateHistory'>
  > &
    SpawnerConfig;

  constructor(
    private readonly agentManager: AgentManager,
    config: SpawnerConfig = {},
  ) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 5,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 60_000,
      maxStateHistory: config.maxStateHistory ?? 100,
      ...config,
    };
  }

  // -----------------------------------------------------------------------
  // Core Spawn
  // -----------------------------------------------------------------------

  /**
   * Spawn an isolated sub-agent and execute its designated task.
   * Respects concurrency limits and timeout settings.
   */
  async spawn(input: SubagentSpawnInput): Promise<SubagentSpawnResult> {
    // Enforce concurrency limit
    if (this.runningIds.size >= this.config.maxConcurrency) {
      return {
        subagentId: 'rejected',
        taskId: 'rejected',
        status: 'failed',
        error: `Concurrency limit reached (${this.config.maxConcurrency}). Retry later.`,
        duration: 0,
      };
    }

    const startTime = Date.now();
    const timeoutMs = input.timeoutMs ?? this.config.defaultTimeoutMs;

    // Create a managed agent for this isolated workstream
    const agent = this.agentManager.create({
      name: input.name,
      role: input.role,
      description: input.description,
      skills: input.skills,
      model: input.model,
      systemPrompt: input.systemPrompt,
    });

    const stateId = generateSubId();
    const state: SubagentState = {
      id: stateId,
      parentId: input.parentId,
      agent,
      task: { id: 'pending', agentId: agent.id, description: input.task, status: 'pending' },
      createdAt: startTime,
      status: 'running',
      context: { ...(input.context ?? {}) },
      tags: input.tags ?? [],
    };

    this.activeSubagents.set(stateId, state);
    this.runningIds.add(agent.id);
    this.config.onSpawn?.(state);

    try {
      // Race task execution against timeout
      const taskResult = await this.executeWithTimeout(
        () => this.agentManager.assignTask(agent.id, input.task),
        timeoutMs,
      );

      const completedState: SubagentState = {
        ...state,
        task: taskResult,
        status: 'completed',
        completedAt: Date.now(),
      };
      this.updateState(stateId, completedState);

      const result: SubagentSpawnResult = {
        subagentId: agent.id,
        taskId: taskResult.id,
        status: taskResult.status === 'completed' ? 'completed' : 'failed',
        result: taskResult.result,
        error: taskResult.error,
        duration: Date.now() - startTime,
        outputContext: completedState.context,
      };

      if (taskResult.status === 'completed') {
        this.config.onComplete?.(completedState, result);
      } else {
        this.config.onError?.(completedState, new Error(taskResult.error ?? 'Task failed'));
      }

      return result;
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err : new Error(String(err));
      const isTimeout = error.message.startsWith('[SubagentTimeout]');

      const failedState: SubagentState = {
        ...state,
        status: isTimeout ? 'timeout' : 'failed',
        completedAt: Date.now(),
      };
      this.updateState(stateId, failedState);

      this.config.onError?.(failedState, error);

      return {
        subagentId: agent.id,
        taskId: 'error_task_failed',
        status: isTimeout ? 'timeout' : 'failed',
        error: error.message,
        duration,
      };
    } finally {
      this.runningIds.delete(agent.id);
      this.agentManager.remove(agent.id);
      this.trimStateHistory();
    }
  }

  // -----------------------------------------------------------------------
  // Parallel & Sequential Spawning
  // -----------------------------------------------------------------------

  /**
   * Spawn multiple sub-agents in parallel, respecting concurrency limits.
   * If inputs exceed maxConcurrency, they are batched automatically.
   */
  async spawnParallel(inputs: SubagentSpawnInput[]): Promise<SubagentSpawnResult[]> {
    const results: SubagentSpawnResult[] = [];
    const batches: SubagentSpawnInput[][] = [];

    // Split into batches that fit within the concurrency limit
    for (let i = 0; i < inputs.length; i += this.config.maxConcurrency) {
      batches.push(inputs.slice(i, i + this.config.maxConcurrency));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map((input) => this.spawn(input)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Spawn multiple sub-agents in sequence.
   * Each subsequent agent can access the result of the previous one via context.
   */
  async spawnSequence(inputs: SubagentSpawnInput[]): Promise<SubagentSpawnResult[]> {
    const results: SubagentSpawnResult[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (!input) continue;

      // Inject previous result into context for chaining
      if (results.length > 0) {
        const prev = results[results.length - 1];
        input.context = {
          ...input.context,
          _previousResult: prev?.result,
          _previousIndex: i - 1,
          _sequenceResults: results.map((r) => r.result),
        };
      }

      const res = await this.spawn(input);
      results.push(res);
    }
    return results;
  }

  // -----------------------------------------------------------------------
  // State Management
  // -----------------------------------------------------------------------

  /** List all tracked sub-agent states */
  listStates(): SubagentState[] {
    return [...this.activeSubagents.values()];
  }

  /** List only running sub-agents */
  listRunning(): SubagentState[] {
    return this.listStates().filter((s) => s.status === 'running');
  }

  /** List sub-agents by tag */
  listByTag(tag: string): SubagentState[] {
    return this.listStates().filter((s) => s.tags.includes(tag));
  }

  /** List sub-agents by parent id */
  listByParent(parentId: string): SubagentState[] {
    return this.listStates().filter((s) => s.parentId === parentId);
  }

  /** Get a specific sub-agent state by id */
  getState(id: string): SubagentState | undefined {
    return this.activeSubagents.get(id);
  }

  /** Get the number of currently running sub-agents */
  get activeCount(): number {
    return this.runningIds.size;
  }

  /** Get the number of available concurrency slots */
  get availableSlots(): number {
    return Math.max(0, this.config.maxConcurrency - this.runningIds.size);
  }

  /** Clear all completed/failed states (keep running ones) */
  clearFinished(): number {
    let count = 0;
    for (const [id, state] of this.activeSubagents) {
      if (state.status !== 'running') {
        this.activeSubagents.delete(id);
        count++;
      }
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  private updateState(id: string, state: SubagentState): void {
    this.activeSubagents.set(id, state);
  }

  private trimStateHistory(): void {
    if (this.activeSubagents.size <= this.config.maxStateHistory) return;
    // Remove oldest completed entries
    const sorted = [...this.activeSubagents.entries()]
      .filter(([, s]) => s.status !== 'running')
      .sort(([, a], [, b]) => a.createdAt - b.createdAt);

    const excess = this.activeSubagents.size - this.config.maxStateHistory;
    for (let i = 0; i < excess && i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry) this.activeSubagents.delete(entry[0]);
    }
  }

  /**
   * Execute an async function with a timeout.
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`[SubagentTimeout] Execution exceeded ${timeoutMs}ms limit`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
