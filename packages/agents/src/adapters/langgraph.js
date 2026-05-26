// ==============================================================================
// GHITA CODING AGENT - LangGraph Agent Adapter
// ==============================================================================
import { HumanMessage, AIMessage, SystemMessage } from '../messages/message.js';
/**
 * Adapter to convert LangGraph agent configurations into GHITA's ReAct agent format.
 *
 * Supports:
 * - Converting LangChain-style tools
 * - Mapping system prompts
 * - Graph node/edge to sequential step conversion
 */
export class LangGraphAdapter {
    name = 'langgraph';
    /**
     * Convert a LangGraph config into a GHITA-compatible ReAct config.
     */
    convertConfig(config) {
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
    convertMessages(externalMessages) {
        return externalMessages.map((msg) => {
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
        });
    }
    /**
     * Convert GHITA result back to LangGraph-compatible format.
     */
    convertResult(result) {
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
    static convertTool(tool) {
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
    static buildLinearGraph(nodeIds, handlers) {
        const nodes = nodeIds.map((id) => ({
            id,
            handler: handlers.get(id) ?? (async (state) => state),
        }));
        const edges = [];
        for (let i = 0; i < nodeIds.length - 1; i++) {
            edges.push({ from: nodeIds[i], to: nodeIds[i + 1] });
        }
        return { nodes, edges };
    }
    parseToolCalls(toolCalls) {
        if (!toolCalls || !Array.isArray(toolCalls))
            return undefined;
        return toolCalls.map((tc) => ({
            id: tc.id ?? `tc_${Math.random().toString(36).slice(2, 8)}`,
            name: tc.function?.name ?? tc.name ?? 'unknown',
            arguments: typeof tc.function?.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : (tc.arguments ?? {}),
        }));
    }
}
//# sourceMappingURL=langgraph.js.map