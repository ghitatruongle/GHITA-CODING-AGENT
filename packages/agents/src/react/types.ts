import type { BaseMessage } from '../messages/message.js';
import type { MessageData } from '../messages/types.js';
import type { AgentMiddleware } from '../middleware/types.js';
import type { RunnableConfig } from '../pipeline/types.js';
import type { HookDispatcher } from '../hooks/types.js';
import type { InterjectionBuffer } from '../interjection/buffer.js';

export type AgentAction = {
  tool: string;
  toolCallId: string;
  input: Record<string, unknown>;
};

export type AgentFinish = {
  returnValues: Record<string, unknown>;
  output: string;
  messages: BaseMessage[];
};

export type AgentStep = {
  action: AgentAction;
  observation: string;
};

export type ReActCheckpointStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'exhausted';

/**
 * Durable, provider-neutral snapshot of a ReAct run.
 *
 * `pendingActions` is persisted before a tool starts. A caller must explicitly
 * opt in before resuming such a checkpoint because the tool may have completed
 * its side effect before the process stopped.
 */
export interface ReActCheckpoint {
  version: 1;
  runId: string;
  agentId: string;
  agentName: string;
  userMessage: string;
  status: ReActCheckpointStatus;
  maxIterations: number;
  nextIteration: number;
  messages: MessageData[];
  steps: AgentStep[];
  pendingActions: AgentAction[];
  output?: string;
  error?: string;
  updatedAt: number;
}

export type ReActCheckpointWriter = (checkpoint: ReActCheckpoint) => void | Promise<void>;

/**
 * v0.4.9 A2: Policy guard hook — evaluated before every tool execution.
 * Structurally compatible with @ghita/security PolicyEngine.evaluate(), but
 * declared locally so this package stays decoupled from the security package.
 */
export interface ToolPolicyRequest {
  tool: string;
  action: string;
  resource?: string;
  agentId?: string;
  input?: Record<string, unknown>;
}

export interface ToolPolicyDecision {
  decision: 'allow' | 'deny';
  reason?: string;
}

export type PolicyGuard = (
  request: ToolPolicyRequest,
) => ToolPolicyDecision | Promise<ToolPolicyDecision>;

export interface ReActAgentConfig {
  /** Agent name */
  name: string;
  /** System prompt */
  systemPrompt?: string;
  /** Model to use */
  model?: string;
  /** Provider to use */
  provider?: string;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Maximum iterations before forced stop */
  maxIterations?: number;
  /** v1.1.5-beta1 T2.5: max steps for subagent — when reached, agent summarizes instead of continuing. */
  maxSteps?: number;
  /** Tools available to the agent */
  tools?: ReActTool[];
  /** Middleware to apply */
  middleware?: AgentMiddleware[];
  /** Structured output schema (Zod or JSON Schema) */
  outputSchema?: StructuredOutputSchema;
  /** Stop condition */
  stopCondition?: (steps: AgentStep[]) => boolean;
  /**
   * v0.4.9 A2: Optional deny-default policy guard. When provided, every
   * tool-call is evaluated before execution; a 'deny' decision blocks the
   * tool and feeds the reason back to the model as the observation.
   */
  policyGuard?: PolicyGuard;
  /**

   * tool boundary (PreToolUse / PostToolUse / PostToolUseFailure) plus
   * SessionStart / Stop. A 'block' outcome stops the tool like a policy deny.
   */
  hooks?: HookDispatcher;
  /**

   * "untrusted"> envelopes before it enters the LLM context (default true).
   * The step journal keeps the raw observation; only messages are wrapped.
   */
  untrustedOutput?: boolean;
  
  interjection?: InterjectionBuffer;
  /** Stable ID used by durable run journals. Generated when omitted. */
  runId?: string;
  /** Resume a previously persisted run snapshot. */
  resumeFrom?: ReActCheckpoint;
  /** Called at every safe point and before/after each tool execution. */
  checkpoint?: ReActCheckpointWriter;
  /**
   * Explicit acknowledgement that pending tools may be executed again.
   * Required when `resumeFrom.pendingActions` is non-empty.
   */
  resumePendingTools?: boolean;
  /** Optional cooperative cancellation signal. */
  signal?: AbortSignal;
}

export interface ReActTool {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON Schema for input parameters */
  parameters: Record<string, unknown>;
  /** Execute the tool */
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface StructuredOutputSchema {
  /** Schema name */
  name: string;
  /** JSON Schema definition */
  schema: Record<string, unknown>;
  /** Whether to use strict mode */
  strict?: boolean;
}

export interface ReActAgentCallbacks {
  onStepStart?: (step: number, action: AgentAction) => void;
  onStepEnd?: (step: number, observation: string) => void;
  onToolCall?: (tool: string, input: Record<string, unknown>) => void;
  onToolResult?: (tool: string, result: string) => void;
  onFinish?: (result: AgentFinish) => void;
  onError?: (error: Error) => void;
}

export interface CreateReActAgentInput {
  config: ReActAgentConfig;
  /** LLM call function (provider-agnostic) */
  llmCall: (messages: BaseMessage[], config?: RunnableConfig) => Promise<BaseMessage>;
  /** Parse tool calls from AI message */
  parseToolCalls?: (message: BaseMessage) => AgentAction[];
}

export interface ReActAgentRunResult {
  /** Present for durable/checkpointed runs. */
  runId?: string;
  output: string;
  steps: AgentStep[];
  messages: BaseMessage[];
  finish: AgentFinish;
  iterations: number;
  duration: number;
  structuredOutput?: unknown;
}
