// ==============================================================================
// GHITA CODING AGENT - Agent Middleware Types
// ==============================================================================

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
