// ==============================================================================
// GHITA CODING AGENT - OpenAI Agents SDK Adapter
// ==============================================================================

import type { BaseMessage } from '../messages/message.js';
import { HumanMessage, AIMessage, SystemMessage } from '../messages/message.js';
import type {
  AgentAdapter,
  AdapterConvertedConfig,
  AdapterRunResult,
  OpenAIAgentConfig,
  OpenAIAgentTool,
} from './types.js';


/**
 * Adapter to convert OpenAI Agents SDK configurations into GHITA's format.
 *
 * Supports:
 * - Converting OpenAI function tools
 * - Handoff agent mapping
 * - Instruction → system prompt mapping
 */
export class OpenAIAgentsAdapter implements AgentAdapter<OpenAIAgentConfig> {
  readonly name = 'openai-agents';

  /**
   * Convert OpenAI Agents config to GHITA ReAct config.
   */
  convertConfig(config: OpenAIAgentConfig): AdapterConvertedConfig {
    const tools = (config.tools ?? [])
      .filter((t) => t.type === 'function')
      .map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
        execute: t.function.handler,
      }));

    return {
      name: config.name,
      systemPrompt: config.instructions,
      model: config.model ?? 'gpt-4o',
      tools,
      maxIterations: config.maxTurns ?? 10,
    };
  }

  /**
   * Convert OpenAI chat messages to GHITA messages.
   */
  convertMessages(externalMessages: unknown[]): BaseMessage[] {
    return (externalMessages as Array<{
      role: string;
      content: string;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    }>).map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant': {
          const toolCalls = msg.tool_calls?.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          }));
          return new AIMessage(msg.content, { toolCalls });
        }
        default:
          return new HumanMessage(msg.content);
      }
    });
  }

  /**
   * Convert GHITA result back to OpenAI Agents format.
   */
  convertResult(result: AdapterRunResult): {
    finalOutput: string;
    messages: Array<{ role: string; content: string }>;
  } {
    return {
      finalOutput: result.output,
      messages: result.messages.map((m) => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.getText(),
      })),
    };
  }

  /**
   * Convert an OpenAI function tool to GHITA format.
   */
  static convertTool(tool: OpenAIAgentTool): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (input: Record<string, unknown>) => Promise<string>;
  } {
    return {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      execute: tool.function.handler,
    };
  }

  /**
   * Build a handoff mapping for multi-agent handoff scenarios.
   */
  static buildHandoffMap(
    agents: Array<{ name: string; handoffs?: string[] }>,
  ): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const agent of agents) {
      map.set(agent.name, agent.handoffs ?? []);
    }
    return map;
  }
}
