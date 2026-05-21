// ==============================================================================
// GHITA CODING AGENT - Subagent Spawner
// ==============================================================================

import type { AgentManager } from '../index.js';
import type { SubagentSpawnInput, SubagentSpawnResult, SubagentState } from './types.js';

export class SubagentSpawner {
  private readonly activeSubagents = new Map<string, SubagentState>();

  constructor(private readonly agentManager: AgentManager) {}

  /**
   * Spawns an isolated subagent and executes its designated task.
   */
  async spawn(input: SubagentSpawnInput): Promise<SubagentSpawnResult> {
    const startTime = Date.now();
    
    // Create/register a new managed agent for this isolated workstream
    const agent = this.agentManager.create({
      name: input.name,
      role: input.role,
      description: input.description,
      skills: input.skills,
      model: input.model,
      systemPrompt: input.systemPrompt,
    });

    const stateId = `sub_${agent.id}`;
    
    try {
      // Execute the task via AgentManager
      const taskResult = await this.agentManager.assignTask(agent.id, input.task);
      
      const completedState: SubagentState = {
        id: stateId,
        parentId: input.parentId,
        agent,
        task: taskResult,
        createdAt: startTime,
        completedAt: Date.now(),
      };
      
      this.activeSubagents.set(stateId, completedState);

      return {
        subagentId: agent.id,
        taskId: taskResult.id,
        status: taskResult.status === 'completed' ? 'completed' : 'failed',
        result: taskResult.result,
        error: taskResult.error,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      return {
        subagentId: agent.id,
        taskId: 'error_task_failed',
        status: 'failed',
        error: errorMsg,
        duration,
      };
    } finally {
      // Clean up the subagent from the active manager to prevent memory leaks
      this.agentManager.remove(agent.id);
    }
  }

  /**
   * Spawns multiple subagents in parallel to handle concurrent workstreams.
   */
  async spawnParallel(inputs: SubagentSpawnInput[]): Promise<SubagentSpawnResult[]> {
    const promises = inputs.map(input => this.spawn(input));
    return Promise.all(promises);
  }

  /**
   * Spawns multiple subagents in sequence, where later agents can build upon prior results.
   */
  async spawnSequence(inputs: SubagentSpawnInput[]): Promise<SubagentSpawnResult[]> {
    const results: SubagentSpawnResult[] = [];
    for (const input of inputs) {
      const res = await this.spawn(input);
      results.push(res);
    }
    return results;
  }

  /**
   * Lists the tracking state of recently finished/active subagents.
   */
  listStates(): SubagentState[] {
    return [...this.activeSubagents.values()];
  }
}
