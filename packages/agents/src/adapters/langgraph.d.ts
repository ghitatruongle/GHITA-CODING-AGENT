import type { BaseMessage } from '../messages/message.js';
import type { AgentAdapter, AdapterConvertedConfig, AdapterRunResult, LangGraphAgentConfig, LangGraphTool } from './types.js';
/**
 * Adapter to convert LangGraph agent configurations into GHITA's ReAct agent format.
 *
 * Supports:
 * - Converting LangChain-style tools
 * - Mapping system prompts
 * - Graph node/edge to sequential step conversion
 */
export declare class LangGraphAdapter implements AgentAdapter<LangGraphAgentConfig> {
    readonly name = "langgraph";
    /**
     * Convert a LangGraph config into a GHITA-compatible ReAct config.
     */
    convertConfig(config: LangGraphAgentConfig): AdapterConvertedConfig;
    /**
     * Convert LangChain message format to GHITA messages.
     */
    convertMessages(externalMessages: unknown[]): BaseMessage[];
    /**
     * Convert GHITA result back to LangGraph-compatible format.
     */
    convertResult(result: AdapterRunResult): {
        output: string;
        messages: Array<{
            role: string;
            content: string;
        }>;
        steps: number;
    };
    /**
     * Convert a LangGraph tool definition to a GHITA-compatible tool.
     */
    static convertTool(tool: LangGraphTool): {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        execute: (input: Record<string, unknown>) => Promise<string>;
    };
    /**
     * Build a simple linear graph from sequential node IDs.
     */
    static buildLinearGraph(nodeIds: string[], handlers: Map<string, (state: Record<string, unknown>) => Promise<Record<string, unknown>>>): {
        nodes: Array<{
            id: string;
            handler: typeof handlers extends Map<string, infer H> ? H : never;
        }>;
        edges: Array<{
            from: string;
            to: string;
        }>;
    };
    private parseToolCalls;
}
//# sourceMappingURL=langgraph.d.ts.map