// ==============================================================================
// GHITA CODING AGENT - Workflow Agent Engine
// ==============================================================================

export interface WorkflowStep {
  id: string;
  name: string;
  execute: (state: Record<string, unknown>) => Promise<unknown>;
  dependsOn?: string[];
}

export interface WorkflowCallbacks {
  onStart?: (workflowName: string, initialState: Record<string, unknown>) => void | Promise<void>;
  onStepStart?: (stepId: string, stepName: string) => void | Promise<void>;
  onStepFinish?: (stepId: string, stepName: string, result: unknown, durationMs: number) => void | Promise<void>;
  onFinish?: (state: Record<string, unknown>, durationMs: number) => void | Promise<void>;
  onError?: (stepId: string | null, error: Error) => void | Promise<void>;
}

export class WorkflowAgent {
  readonly name: string;
  private steps: WorkflowStep[] = [];
  private state: Record<string, unknown> = {};

  constructor(name: string, initialConfig?: { steps?: WorkflowStep[]; state?: Record<string, unknown> }) {
    this.name = name;
    if (initialConfig?.steps) this.steps = initialConfig.steps;
    if (initialConfig?.state) this.state = { ...initialConfig.state };
  }

  addStep(step: WorkflowStep): this {
    this.steps.push(step);
    return this;
  }

  getState(): Record<string, unknown> {
    return this.state;
  }

  setState(state: Record<string, unknown>): void {
    this.state = { ...state };
  }

  async run(callbacks: WorkflowCallbacks = {}): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    try {
      if (callbacks.onStart) {
        await Promise.resolve(callbacks.onStart(this.name, this.state));
      }

      const executed = new Set<string>();
      const inProgress = new Set<string>();

      const executeStepWithDeps = async (step: WorkflowStep): Promise<void> => {
        if (executed.has(step.id)) return;
        if (inProgress.has(step.id)) throw new Error(`Circular dependency detected at step ${step.id}`);
        inProgress.add(step.id);

        // Resolve dependencies first
        if (step.dependsOn) {
          for (const depId of step.dependsOn) {
            const depStep = this.steps.find((s) => s.id === depId);
            if (depStep) {
              await executeStepWithDeps(depStep);
            }
          }
        }

        if (callbacks.onStepStart) {
          await Promise.resolve(callbacks.onStepStart(step.id, step.name));
        }

        const stepStartTime = Date.now();
        try {
          const result = await step.execute(this.state);
          this.state[step.id] = result;
          const duration = Date.now() - stepStartTime;

          if (callbacks.onStepFinish) {
            await Promise.resolve(callbacks.onStepFinish(step.id, step.name, result, duration));
          }
 } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          if (callbacks.onError) {
            await Promise.resolve(callbacks.onError(step.id, err));
          }
          throw err;
        }

        inProgress.delete(step.id);
        executed.add(step.id);
      };

      for (const step of this.steps) {
        await executeStepWithDeps(step);
      }

      const totalDuration = Date.now() - startTime;
      if (callbacks.onFinish) {
        await Promise.resolve(callbacks.onFinish(this.state, totalDuration));
      }

 } catch (error: unknown) {
 const err = error instanceof Error ? error : new Error(String(error));
 if (callbacks.onError) {
 await Promise.resolve(callbacks.onError(null, err));
 }
 throw err;
 }

    return this.state;
  }
}
