// ==============================================================================
// GHITA CODING AGENT - LangGraph Agent Adapter
// ==============================================================================

import type { BaseMessage } from '../messages/message.js';
import { HumanMessage, AIMessage, SystemMessage } from '../messages/message.js';
import type {
  AgentAdapter,
  AdapterConvertedConfig,
  AdapterRunResult,
  LangGraphAgentConfig,
  LangGraphTool,
} from './types.js';


/**
 * Adapter to convert LangGraph agent configurations into GHITA's ReAct agent format.
 *
 * Supports:
 * - Converting LangChain-style tools
 * - Mapping system prompts
 * - Graph node/edge to sequential step conversion
 */
export class LangGraphAdapter implements AgentAdapter<LangGraphAgentConfig> {
  readonly name = 'langgraph';

  /**
   * Convert a LangGraph config into a GHITA-compatible ReAct config.
   */
  convertConfig(config: LangGraphAgentConfig): AdapterConvertedConfig {
    const tools = (config.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
      execute: tool.func,
    }));

    return {
      name: config.name,
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools,
      maxIterations: config.recursionLimit ?? 25,
    };
  }

  /**
   * Convert LangChain message format to GHITA messages.
   */
  convertMessages(externalMessages: unknown[]): BaseMessage[] {
    return (externalMessages as Array<{ role: string; content: string; tool_calls?: unknown[] }>).map(
      (msg) => {
        switch (msg.role) {
          case 'system':
            return new SystemMessage(msg.content);
          case 'user':
            return new HumanMessage(msg.content);
          case 'assistant':
            return new AIMessage(msg.content, {
              toolCalls: this.parseToolCalls(msg.tool_calls),
            });
          default:
            return new HumanMessage(msg.content);
        }
      },
    );
  }

  /**
   * Convert GHITA result back to LangGraph-compatible format.
   */
  convertResult(result: AdapterRunResult): {
    output: string;
    messages: Array<{ role: string; content: string }>;
    steps: number;
  } {
    return {
      output: result.output,
      messages: result.messages.map((m) => ({
        role: m.role,
        content: m.getText(),
      })),
      steps: result.steps.length,
    };
  }

  /**
   * Convert a LangGraph tool definition to a GHITA-compatible tool.
   */
  static convertTool(tool: LangGraphTool): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (input: Record<string, unknown>) => Promise<string>;
  } {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
      execute: tool.func,
    };
  }

  /**
   * Build a simple linear graph from sequential node IDs.
   */
  static buildLinearGraph(
    nodeIds: string[],
    handlers: Map<string, (state: Record<string, unknown>) => Promise<Record<string, unknown>>>,
  ): { nodes: Array<{ id: string; handler: typeof handlers extends Map<string, infer H> ? H : never }>; edges: Array<{ from: string; to: string }> } {
    const nodes = nodeIds.map((id) => ({
      id,
      handler: handlers.get(id) ?? (async (state: Record<string, unknown>) => state),
    }));

    const edges: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < nodeIds.length - 1; i++) {
      edges.push({ from: nodeIds[i]!, to: nodeIds[i + 1]! });
    }

    return { nodes, edges };
  }

  private parseToolCalls(
    toolCalls: unknown[] | undefined,
  ): Array<{ id: string; name: string; arguments: Record<string, unknown> }> | undefined {
    if (!toolCalls || !Array.isArray(toolCalls)) return undefined;
    return toolCalls.map((tc: any) => ({
      id: tc.id ?? `tc_${Math.random().toString(36).slice(2, 8)}`,
      name: tc.function?.name ?? tc.name ?? 'unknown',
      arguments: typeof tc.function?.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : (tc.arguments ?? {}),
    }));
  }
}
