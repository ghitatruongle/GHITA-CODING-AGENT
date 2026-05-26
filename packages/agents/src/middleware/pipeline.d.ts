import type { AgentMiddleware, MiddlewareContext, AgentStepResult } from './types.js';
import type { BaseMessage } from '../messages/message.js';
export declare class MiddlewarePipeline {
    private readonly middlewares;
    /** Register a middleware */
    use(middleware: AgentMiddleware): void;
    /** Remove a middleware by name */
    remove(name: string): boolean;
    /** List registered middleware names */
    list(): string[];
    /** Run all preModel hooks, applying modifications in order */
    runPreModel(context: MiddlewareContext): Promise<{
        context: MiddlewareContext;
        shortCircuit?: BaseMessage;
    }>;
    /** Run all postModel hooks */
    runPostModel(context: MiddlewareContext, stepResult: AgentStepResult): Promise<{
        result: AgentStepResult;
        retry: boolean;
        retryReason?: string;
    }>;
    /** Run all preTool hooks */
    runPreTool(toolName: string, args: Record<string, unknown>, context: MiddlewareContext): Promise<{
        proceed: boolean;
        args: Record<string, unknown>;
        reason?: string;
    }>;
    /** Run all postTool hooks */
    runPostTool(toolName: string, result: string, context: MiddlewareContext): Promise<string>;
    /** Run all onError hooks */
    runOnError(error: Error, context: MiddlewareContext): Promise<{
        retry: boolean;
    }>;
    /** Run all onComplete hooks */
    runOnComplete(context: MiddlewareContext, finalResponse: BaseMessage): Promise<void>;
}
//# sourceMappingURL=pipeline.d.ts.map