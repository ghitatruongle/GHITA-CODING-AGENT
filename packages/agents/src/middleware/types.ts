import type { ManagedAgent } from '../index.js';
import type { BaseMessage } from '../messages/message.js';

export interface AgentStepContext {
  agent: ManagedAgent;
  messages: BaseMessage[];
  stepNumber: number;
  maxSteps: number;
  metadata: Record<string, unknown>;
}

export interface AgentStepResult {
  /** Response message from the model */
  response: BaseMessage;
  /** Whether the agent should continue (has tool calls to execute) */
  shouldContinue: boolean;
  /** Tool calls to execute before next step */
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

export interface MiddlewareContext {
  agent: ManagedAgent;
  messages: BaseMessage[];
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  metadata: Record<string, unknown>;
  /** Bypasses all middlewares if true, optimizing latency for simple tasks */
  skipMiddlewares?: boolean;
}

export interface PreModelResult {
  /** Modified messages */
  messages?: BaseMessage[];
  /** Modified model */
  model?: string;
  /** Modified provider */
  provider?: string;
  /** If set, skip model call and return this directly */
  shortCircuit?: BaseMessage;
  /** Additional metadata to merge */
  metadata?: Record<string, unknown>;
}

export interface PostModelResult {
  /** Modified response */
  response?: BaseMessage;
  /** Whether to retry the model call */
  retry?: boolean;
  /** Reason for retry */
  retryReason?: string;
  /** Additional metadata to merge */
  metadata?: Record<string, unknown>;
}

export interface HumanApprovalRequest {
  id: string;
  agent: ManagedAgent;
  action: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export interface HumanApprovalResponse {
  approved: boolean;
  reason?: string;
  modifiedArgs?: Record<string, unknown>;
}

export interface AgentMiddleware {
  /** Human-readable name */
  readonly name: string;

  /** Priority (lower = earlier execution) */
  readonly priority: number;

  /** Called before sending messages to the model */
  preModel?(context: MiddlewareContext): Promise<PreModelResult | void>;

  /** Called after receiving response from the model */
  postModel?(context: MiddlewareContext, result: AgentStepResult): Promise<PostModelResult | void>;

  /** Called when a tool is about to be executed */
  preTool?(
    toolName: string,
    args: Record<string, unknown>,
    context: MiddlewareContext,
  ): Promise<{ proceed: boolean; modifiedArgs?: Record<string, unknown>; reason?: string } | void>;

  /** Called after a tool has been executed */
  postTool?(
    toolName: string,
    result: string,
    context: MiddlewareContext,
  ): Promise<{ modifiedResult?: string } | void>;

  /** Called when the agent encounters an error */
  onError?(error: Error, context: MiddlewareContext): Promise<{ retry?: boolean } | void>;

  /** Called when the agent completes */
  onComplete?(context: MiddlewareContext, finalResponse: BaseMessage): Promise<void>;
}

/** Configuration for the middleware pipeline */
export interface MiddlewarePipelineConfig {
  /** Maximum execution time for a single middleware hook (ms, default: 30_000) */
  middlewareTimeoutMs?: number;
  /** Whether to stop the pipeline on middleware error (default: false) */
  errorBoundary?: boolean;
  /** Dry-run mode — execute hooks but don't apply mutations (default: false) */
  dryRun?: boolean;
  /** Maximum number of middleware metrics entries to retain (default: 500) */
  maxMetricsEntries?: number;
  /** Whether to collect execution metrics (default: true) */
  metricsEnabled?: boolean;
}

/** Execution metric for a single middleware invocation */
export interface MiddlewareMetric {
  /** Middleware name */
  middlewareName: string;
  /** Hook phase that was called */
  phase: 'preModel' | 'postModel' | 'preTool' | 'postTool' | 'onError' | 'onComplete';
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether the hook succeeded */
  success: boolean;
  /** Error message if the hook failed */
  error?: string;
  /** Timestamp of execution */
  timestamp: number;
}

/** Summary statistics for a middleware */
export interface MiddlewareStats {
  /** Middleware name */
  name: string;
  /** Total invocations across all phases */
  totalCalls: number;
  /** Successful invocations */
  successCount: number;
  /** Failed invocations */
  failureCount: number;
  /** Average duration in ms */
  avgDurationMs: number;
  /** Last execution timestamp */
  lastExecutedAt: number;
}
