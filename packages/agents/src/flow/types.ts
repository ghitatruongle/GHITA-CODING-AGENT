export type FlowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface FlowStep<TInput = unknown, TOutput = unknown> {
  /** Unique step ID */
  id: string;
  /** Step name */
  name: string;
  /** Step description */
  description?: string;
  /** Execute function */
  execute: (input: TInput, context: FlowContext) => Promise<TOutput>;
  /** Condition to determine if step should run */
  condition?: (context: FlowContext) => boolean | Promise<boolean>;
  /** Dependencies (step IDs that must complete before this step) */
  dependsOn?: string[];
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Timeout in ms */
  timeout?: number;
}

export interface FlowStepResult<T = unknown> {
  stepId: string;
  status: FlowStepStatus;
  output?: T;
  error?: string;
  duration: number;
  retries: number;
}

export interface FlowContext {
  /** Flow run ID */
  runId: string;
  /** Shared state accessible by all steps */
  state: Map<string, unknown>;
  /** Results of completed steps */
  results: Map<string, FlowStepResult>;
  /** Set a value in shared state */
  set: <T>(key: string, value: T) => void;
  /** Get a value from shared state */
  get: <T>(key: string) => T | undefined;
  /** Get output of a completed step */
  getStepOutput: <T>(stepId: string) => T | undefined;
}

export type FlowProcessMode = 'sequential' | 'parallel' | 'dag';

export interface FlowConfig {
  /** Flow name */
  name: string;
  /** Flow description */
  description?: string;
  /** Processing mode */
  mode?: FlowProcessMode;
  /** Maximum concurrent parallel steps */
  maxConcurrency?: number;
  /** Global timeout for the entire flow */
  timeout?: number;
  /** Continue on step failure */
  continueOnError?: boolean;
}

export interface FlowRunResult {
  runId: string;
  flowName: string;
  status: 'completed' | 'failed' | 'partial';
  steps: FlowStepResult[];
  duration: number;
  state: Record<string, unknown>;
  error?: string;
}
