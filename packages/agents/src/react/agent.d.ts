import type { ReActTool, CreateReActAgentInput, ReActAgentRunResult, ReActAgentCallbacks, StructuredOutputSchema } from './types.js';
/**
 * ReAct Agent — Reasoning + Acting loop.
 * Implements the think → act → observe cycle with middleware support.
 */
export declare class ReActAgent {
    readonly name: string;
    private readonly config;
    private readonly llmCall;
    private readonly parseToolCalls;
    private readonly pipeline;
    private readonly tools;
    constructor(input: CreateReActAgentInput);
    /** Run the ReAct loop */
    run(userMessage: string, callbacks?: ReActAgentCallbacks): Promise<ReActAgentRunResult>;
    /** Parse structured output from final response */
    parseStructuredOutput<T>(result: ReActAgentRunResult, schema: StructuredOutputSchema): T | undefined;
    /** Get available tool names */
    getToolNames(): string[];
    /** Add a tool at runtime */
    addTool(tool: ReActTool): void;
    private defaultParseToolCalls;
    private buildResult;
}
/** Factory function to create a ReActAgent */
export declare function createReActAgent(input: CreateReActAgentInput): ReActAgent;
//# sourceMappingURL=agent.d.ts.map