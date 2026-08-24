import type { ReActAgent } from '../react/agent.js';
import { Flow } from '../flow/flow.js';
import type { FlowContext } from '../flow/types.js';

export interface DelegatedTask {
  id: string;
  description: string;
  agent: ReActAgent;
  dependsOn?: string[];
}

export interface PipelineConfig {
  name: string;
  mode?: 'sequential' | 'parallel' | 'dag';
  maxConcurrency?: number;
}

export interface PipelineResult {
  runId: string;
  pipelineName: string;
  status: 'completed' | 'failed' | 'partial';
  results: Record<string, string>;
  duration: number;
}

/**
 * TaskDelegationPipeline coordinates task delegation to multiple ReActAgents.
 * Reuses the Flow framework to execute sequential, parallel, or DAG flows.
 */
export class TaskDelegationPipeline {
  readonly name: string;
  private mode: 'sequential' | 'parallel' | 'dag';
  private maxConcurrency: number;
  private tasks: DelegatedTask[] = [];

  constructor(config: PipelineConfig) {
    this.name = config.name;
    this.mode = config.mode ?? 'sequential';
    this.maxConcurrency = config.maxConcurrency ?? 5;
  }

  addTask(task: DelegatedTask): this {
    this.tasks.push(task);
    return this;
  }

  async run(initialContext?: Record<string, unknown>): Promise<PipelineResult> {
    const startTime = Date.now();
    const flow = new Flow({
      name: this.name,
      mode: this.mode,
      maxConcurrency: this.maxConcurrency,
    });

    for (const task of this.tasks) {
      flow.addStep({
        id: task.id,
        name: `Task: ${task.id}`,
        dependsOn: task.dependsOn,
        execute: async (_input: Record<string, unknown>, context: FlowContext) => {
          let prompt = task.description;

          // Inject outputs of dependencies as context
          const contextParts: string[] = [];
          for (const depId of task.dependsOn ?? []) {
            const output = context.getStepOutput<string>(depId);
            if (output) {
              contextParts.push(`[Output from Task ${depId}]:\n${output}`);
            }
          }
          if (contextParts.length > 0) {
            prompt = `${prompt}\n\nContext from previous steps:\n${contextParts.join('\n\n')}`;
          }

          const result = await task.agent.run(prompt);
          return result.output;
        },
      });
    }

    const flowResult = await flow.run(initialContext);

    const results: Record<string, string> = {};
    for (const step of flowResult.steps) {
      if (step.status === 'completed' && typeof step.output === 'string') {
        results[step.stepId] = step.output;
      }
    }

    return {
      runId: flowResult.runId,
      pipelineName: this.name,
      status: flowResult.status,
      results,
      duration: Date.now() - startTime,
    };
  }
}
