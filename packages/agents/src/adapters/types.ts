// ==============================================================================
// GHITA CODING AGENT - Agent Adapter Types
// ==============================================================================

import type { BaseMessage } from '../messages/message.js';
import type { AgentStep } from '../react/types.js';

/**
 * Generic interface for adapting external agent frameworks into the GHITA system.
 */
export interface AgentAdapter<TConfig = unknown> {
  /** Adapter name */
  readonly name: string;

  /** Convert external agent config to GHITA ReAct config */
  convertConfig(externalConfig: TConfig): AdapterConvertedConfig;

  /** Convert external messages to GHITA messages */
  convertMessages(externalMessages: unknown[]): BaseMessage[];

  /** Convert GHITA result back to external format */
  convertResult(result: AdapterRunResult): unknown;
}

export interface AdapterConvertedConfig {
  name: string;
  systemPrompt?: string;
  model?: string;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (input: Record<string, unknown>) => Promise<string>;
  }>;
  maxIterations?: number;
}

export interface AdapterRunResult {
  output: string;
  steps: AgentStep[];
  messages: BaseMessage[];
}

// --- LangGraph Adapter Types ---

export interface LangGraphAgentConfig {
  /** Agent name */
  name: string;
  /** System prompt */
  systemPrompt?: string;
  /** Model name */
  model?: string;
  /** Tools in LangChain format */
  tools?: LangGraphTool[];
  /** Graph nodes (for custom graph) */
  nodes?: LangGraphNode[];
  /** Graph edges */
  edges?: LangGraphEdge[];
  /** Maximum recursion limit */
  recursionLimit?: number;
}

export interface LangGraphTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  func: (input: Record<string, unknown>) => Promise<string>;
}

export interface LangGraphNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'end';
  handler?: (state: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface LangGraphEdge {
  from: string;
  to: string;
  condition?: (state: Record<string, unknown>) => boolean;
}

// --- OpenAI Agents Adapter Types ---

export interface OpenAIAgentConfig {
  /** Agent name */
  name: string;
  /** Instructions (system prompt) */
  instructions?: string;
  /** Model name */
  model?: string;
  /** Tools in OpenAI function format */
  tools?: OpenAIAgentTool[];
  /** Handoff agents */
  handoffs?: string[];
  /** Max turns */
  maxTurns?: number;
}

export interface OpenAIAgentTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<string>;
  };
}

export interface OpenAIAgentResult {
  finalOutput: string;
  messages: Array<{
    role: string;
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  }>;
  handoffTarget?: string;
}
