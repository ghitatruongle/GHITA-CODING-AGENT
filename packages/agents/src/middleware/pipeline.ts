// ==============================================================================
// GHITA CODING AGENT - Agent Middleware Pipeline
// ==============================================================================

import type {
  AgentMiddleware,
  MiddlewareContext,
  AgentStepResult,
} from './types.js';
import type { BaseMessage } from '../messages/message.js';

export class MiddlewarePipeline {
  private readonly middlewares: AgentMiddleware[] = [];

  /** Register a middleware */
  use(middleware: AgentMiddleware): void {
    this.middlewares.push(middleware);
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  /** Remove a middleware by name */
  remove(name: string): boolean {
    const idx = this.middlewares.findIndex((m) => m.name === name);
    if (idx === -1) return false;
    this.middlewares.splice(idx, 1);
    return true;
  }

  /** List registered middleware names */
  list(): string[] {
    return this.middlewares.map((m) => m.name);
  }

  /** Run all preModel hooks, applying modifications in order */
  async runPreModel(context: MiddlewareContext): Promise<{
    context: MiddlewareContext;
    shortCircuit?: BaseMessage;
  }> {
    let currentContext = { ...context };
    for (const mw of this.middlewares) {
      if (!mw.preModel) continue;
      const result = await mw.preModel(currentContext);
      if (!result) continue;

      if (result.shortCircuit) {
        return { context: currentContext, shortCircuit: result.shortCircuit };
      }

      currentContext = {
        ...currentContext,
        messages: result.messages ?? currentContext.messages,
        model: result.model ?? currentContext.model,
        provider: result.provider ?? currentContext.provider,
        metadata: { ...currentContext.metadata, ...result.metadata },
      };
    }
    return { context: currentContext };
  }

  /** Run all postModel hooks */
  async runPostModel(
    context: MiddlewareContext,
    stepResult: AgentStepResult,
  ): Promise<{ result: AgentStepResult; retry: boolean; retryReason?: string }> {
    let currentResult = { ...stepResult };
    let retry = false;
    let retryReason: string | undefined;

    for (const mw of this.middlewares) {
      if (!mw.postModel) continue;
      const result = await mw.postModel(context, currentResult);
      if (!result) continue;

      if (result.response) currentResult.response = result.response;
      if (result.retry) {
        retry = true;
        retryReason = result.retryReason;
      }
      if (result.metadata) {
        context = { ...context, metadata: { ...context.metadata, ...result.metadata } };
      }
    }

    return { result: currentResult, retry, retryReason };
  }

  /** Run all preTool hooks */
  async runPreTool(
    toolName: string,
    args: Record<string, unknown>,
    context: MiddlewareContext,
  ): Promise<{ proceed: boolean; args: Record<string, unknown> }> {
    let currentArgs = { ...args };
    for (const mw of this.middlewares) {
      if (!mw.preTool) continue;
      const result = await mw.preTool(toolName, currentArgs, context);
      if (!result) continue;
      if (!result.proceed) return { proceed: false, args: currentArgs };
      if (result.modifiedArgs) currentArgs = { ...currentArgs, ...result.modifiedArgs };
    }
    return { proceed: true, args: currentArgs };
  }

  /** Run all postTool hooks */
  async runPostTool(
    toolName: string,
    result: string,
    context: MiddlewareContext,
  ): Promise<string> {
    let currentResult = result;
    for (const mw of this.middlewares) {
      if (!mw.postTool) continue;
      const r = await mw.postTool(toolName, currentResult, context);
      if (r?.modifiedResult !== undefined) currentResult = r.modifiedResult;
    }
    return currentResult;
  }

  /** Run all onError hooks */
  async runOnError(
    error: Error,
    context: MiddlewareContext,
  ): Promise<{ retry: boolean }> {
    let shouldRetry = false;
    for (const mw of this.middlewares) {
      if (!mw.onError) continue;
      const result = await mw.onError(error, context);
      if (result?.retry) shouldRetry = true;
    }
    return { retry: shouldRetry };
  }

  /** Run all onComplete hooks */
  async runOnComplete(
    context: MiddlewareContext,
    finalResponse: BaseMessage,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (!mw.onComplete) continue;
      await mw.onComplete(context, finalResponse);
    }
  }
}
