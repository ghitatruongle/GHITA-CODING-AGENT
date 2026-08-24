// Spawns multiple sub-agents in parallel across isolated contexts and aggregates
// their execution results into a unified summary.

export interface SwarmTask {
  id: string;
  name: string;
  instruction: string;
  agentRole?: string;
  input?: Record<string, unknown>;
}

export interface SwarmTaskResult {
  taskId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export class SwarmSpawner {
  /**
   * Run multiple sub-agent tasks concurrently in parallel.
   */
  static async runSwarm(
    tasks: SwarmTask[],
    executor: (task: SwarmTask) => Promise<{ success: boolean; output: string; error?: string }>,
  ): Promise<SwarmTaskResult[]> {
    const promises = tasks.map(async (task) => {
      const startTime = Date.now();
      try {
        const res = await executor(task);
        return {
          taskId: task.id,
          success: res.success,
          output: res.output,
          error: res.error,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        return {
          taskId: task.id,
          success: false,
          output: '',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        };
      }
    });

    return Promise.all(promises);
  }
}
