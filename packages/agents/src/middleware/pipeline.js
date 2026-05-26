// ==============================================================================
// GHITA CODING AGENT - Agent Middleware Pipeline
// ==============================================================================
export class MiddlewarePipeline {
    middlewares = [];
    /** Register a middleware */
    use(middleware) {
        this.middlewares.push(middleware);
        this.middlewares.sort((a, b) => a.priority - b.priority);
    }
    /** Remove a middleware by name */
    remove(name) {
        const idx = this.middlewares.findIndex((m) => m.name === name);
        if (idx === -1)
            return false;
        this.middlewares.splice(idx, 1);
        return true;
    }
    /** List registered middleware names */
    list() {
        return this.middlewares.map((m) => m.name);
    }
    /** Run all preModel hooks, applying modifications in order */
    async runPreModel(context) {
        let currentContext = { ...context };
        for (const mw of this.middlewares) {
            if (!mw.preModel)
                continue;
            const result = await mw.preModel(currentContext);
            if (!result)
                continue;
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
    async runPostModel(context, stepResult) {
        let currentResult = { ...stepResult };
        let retry = false;
        let retryReason;
        for (const mw of this.middlewares) {
            if (!mw.postModel)
                continue;
            const result = await mw.postModel(context, currentResult);
            if (!result)
                continue;
            if (result.response)
                currentResult.response = result.response;
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
    async runPreTool(toolName, args, context) {
        let currentArgs = { ...args };
        for (const mw of this.middlewares) {
            if (!mw.preTool)
                continue;
            const result = await mw.preTool(toolName, currentArgs, context);
            if (!result)
                continue;
            if (!result.proceed)
                return { proceed: false, args: currentArgs, reason: result.reason };
            if (result.modifiedArgs)
                currentArgs = { ...currentArgs, ...result.modifiedArgs };
        }
        return { proceed: true, args: currentArgs };
    }
    /** Run all postTool hooks */
    async runPostTool(toolName, result, context) {
        let currentResult = result;
        for (const mw of this.middlewares) {
            if (!mw.postTool)
                continue;
            const r = await mw.postTool(toolName, currentResult, context);
            if (r?.modifiedResult !== undefined)
                currentResult = r.modifiedResult;
        }
        return currentResult;
    }
    /** Run all onError hooks */
    async runOnError(error, context) {
        let shouldRetry = false;
        for (const mw of this.middlewares) {
            if (!mw.onError)
                continue;
            const result = await mw.onError(error, context);
            if (result?.retry)
                shouldRetry = true;
        }
        return { retry: shouldRetry };
    }
    /** Run all onComplete hooks */
    async runOnComplete(context, finalResponse) {
        for (const mw of this.middlewares) {
            if (!mw.onComplete)
                continue;
            await mw.onComplete(context, finalResponse);
        }
    }
}
//# sourceMappingURL=pipeline.js.map