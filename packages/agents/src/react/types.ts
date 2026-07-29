// ==============================================================================
// GHITA CODING AGENT - ReAct Agent Types
// ==============================================================================

import type { BaseMessage } from '../messages/message.js';
import type { AgentMiddleware } from '../middleware/types.js';
import type { RunnableConfig } from '../pipeline/types.js';

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
  output: string;
  steps: AgentStep[];
  messages: BaseMessage[];
  finish: AgentFinish;
  iterations: number;
  duration: number;
  structuredOutput?: unknown;
}
