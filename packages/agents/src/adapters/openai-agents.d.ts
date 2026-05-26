import type { BaseMessage } from '../messages/message.js';
import type { AgentAdapter, AdapterConvertedConfig, AdapterRunResult, OpenAIAgentConfig, OpenAIAgentTool } from './types.js';
/**
 * Adapter to convert OpenAI Agents SDK configurations into GHITA's format.
 *
 * Supports:
 * - Converting OpenAI function tools
 * - Handoff agent mapping
 * - Instruction → system prompt mapping
 */
export declare class OpenAIAgentsAdapter implements AgentAdapter<OpenAIAgentConfig> {
    readonly name = "openai-agents";
    /**
     * Convert OpenAI Agents config to GHITA ReAct config.
     */
    convertConfig(config: OpenAIAgentConfig): AdapterConvertedConfig;
    /**
     * Convert OpenAI chat messages to GHITA messages.
     */
    convertMessages(externalMessages: unknown[]): BaseMessage[];
    /**
     * Convert GHITA result back to OpenAI Agents format.
     */
    convertResult(result: AdapterRunResult): {
        finalOutput: string;
        messages: Array<{
            role: string;
            content: string;
        }>;
    };
    /**
     * Convert an OpenAI function tool to GHITA format.
     */
    static convertTool(tool: OpenAIAgentTool): {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        execute: (input: Record<string, unknown>) => Promise<string>;
    };
    /**
     * Build a handoff mapping for multi-agent handoff scenarios.
     */
    static buildHandoffMap(agents: Array<{
        name: string;
        handoffs?: string[];
    }>): Map<string, string[]>;
}
//# sourceMappingURL=openai-agents.d.ts.map