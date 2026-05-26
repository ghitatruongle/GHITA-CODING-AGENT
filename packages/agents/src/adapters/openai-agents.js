// ==============================================================================
// GHITA CODING AGENT - OpenAI Agents SDK Adapter
// ==============================================================================
import { HumanMessage, AIMessage, SystemMessage } from '../messages/message.js';
/**
 * Adapter to convert OpenAI Agents SDK configurations into GHITA's format.
 *
 * Supports:
 * - Converting OpenAI function tools
 * - Handoff agent mapping
 * - Instruction → system prompt mapping
 */
export class OpenAIAgentsAdapter {
    name = 'openai-agents';
    /**
     * Convert OpenAI Agents config to GHITA ReAct config.
     */
    convertConfig(config) {
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
    convertMessages(externalMessages) {
        return externalMessages.map((msg) => {
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
    convertResult(result) {
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
    static convertTool(tool) {
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
    static buildHandoffMap(agents) {
        const map = new Map();
        for (const agent of agents) {
            map.set(agent.name, agent.handoffs ?? []);
        }
        return map;
    }
}
//# sourceMappingURL=openai-agents.js.map