// ==============================================================================
// GHITA CODING AGENT - Flow Orchestration Engine
// ==============================================================================
function generateId() {
    return `flow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * Flow — Orchestrates multi-step task pipelines with dependencies.
 * Supports sequential, parallel, and DAG-based execution modes.
 * Inspired by CrewAI Flow.
 */
export class Flow {
    name;
    description;
    steps = new Map();
    config;
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.config = {
            name: config.name,
            mode: config.mode ?? 'sequential',
            maxConcurrency: config.maxConcurrency ?? 5,
            timeout: config.timeout ?? 0,
            continueOnError: config.continueOnError ?? false,
        };
    }
    /** Add a step to the flow */
    addStep(step) {
        this.steps.set(step.id, step);
        return this;
    }
    /** Remove a step */
    removeStep(id) {
        return this.steps.delete(id);
    }
    /** Get a step by ID */
    getStep(id) {
        return this.steps.get(id);
    }
    /** List all steps */
    listSteps() {
        return [...this.steps.values()];
    }
    /** Execute the flow */
    async run(initialState) {
        const runId = generateId();
        const startTime = Date.now();
        const stateMap = new Map();
        if (initialState) {
            for (const [k, v] of Object.entries(initialState))
                stateMap.set(k, v);
        }
        const resultsMap = new Map();
        const context = {
            runId,
            state: stateMap,
            results: resultsMap,
            set: (key, value) => stateMap.set(key, value),
            get: (key) => stateMap.get(key),
            getStepOutput: (stepId) => resultsMap.get(stepId)?.output,
        };
        let stepResults;
        try {
            switch (this.config.mode) {
                case 'sequential':
                    stepResults = await this.runSequential(context);
                    break;
                case 'parallel':
                    stepResults = await this.runParallel(context);
                    break;
                case 'dag':
                    stepResults = await this.runDAG(context);
                    break;
                default:
                    stepResults = await this.runSequential(context);
            }
        }
        catch (err) {
            return {
                runId,
                flowName: this.name,
                status: 'failed',
                steps: [...resultsMap.values()],
                duration: Date.now() - startTime,
                state: Object.fromEntries(stateMap),
                error: err instanceof Error ? err.message : String(err),
            };
        }
        const hasFailure = stepResults.some((r) => r.status === 'failed');
        return {
            runId,
            flowName: this.name,
            status: hasFailure ? 'partial' : 'completed',
            steps: stepResults,
            duration: Date.now() - startTime,
            state: Object.fromEntries(stateMap),
        };
    }
    // ---- Execution Modes ----
    async runSequential(context) {
        const results = [];
        for (const step of this.steps.values()) {
            const result = await this.executeStep(step, context);
            results.push(result);
            context.results.set(step.id, result);
            if (result.status === 'failed' && !this.config.continueOnError) {
                throw new Error(`Step "${step.id}" failed: ${result.error}`);
            }
        }
        return results;
    }
    async runParallel(context) {
        const stepArray = [...this.steps.values()];
        const chunks = this.chunkArray(stepArray, this.config.maxConcurrency);
        const allResults = [];
        for (const chunk of chunks) {
            const chunkResults = await Promise.all(chunk.map((step) => this.executeStep(step, context)));
            for (const result of chunkResults) {
                context.results.set(result.stepId, result);
            }
            allResults.push(...chunkResults);
        }
        return allResults;
    }
    async runDAG(context) {
        const results = [];
        const completed = new Set();
        const stepMap = this.steps;
        // Topological execution
        const remaining = new Set(stepMap.keys());
        while (remaining.size > 0) {
            // Find steps whose dependencies are all satisfied
            const ready = [];
            for (const id of remaining) {
                const step = stepMap.get(id);
                const deps = step.dependsOn ?? [];
                const allDepsMet = deps.every((d) => completed.has(d));
                if (allDepsMet)
                    ready.push(step);
            }
            if (ready.length === 0 && remaining.size > 0) {
                throw new Error('Circular dependency detected in flow DAG');
            }
            // Execute ready steps in parallel
            const chunkResults = await Promise.all(ready.map((step) => this.executeStep(step, context)));
            for (const result of chunkResults) {
                context.results.set(result.stepId, result);
                completed.add(result.stepId);
                remaining.delete(result.stepId);
                results.push(result);
                if (result.status === 'failed' && !this.config.continueOnError) {
                    throw new Error(`Step "${result.stepId}" failed: ${result.error}`);
                }
            }
        }
        return results;
    }
    // ---- Step Execution ----
    async executeStep(step, context) {
        const startTime = Date.now();
        const maxRetries = step.maxRetries ?? 0;
        let retries = 0;
        let lastError;
        // Check condition
        if (step.condition) {
            const shouldRun = await step.condition(context);
            if (!shouldRun) {
                return {
                    stepId: step.id,
                    status: 'skipped',
                    duration: Date.now() - startTime,
                    retries: 0,
                };
            }
        }
        // Gather input from dependencies
        const depOutputs = {};
        for (const depId of step.dependsOn ?? []) {
            const depResult = context.results.get(depId);
            if (depResult?.output !== undefined) {
                depOutputs[depId] = depResult.output;
            }
        }
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                let output;
                if (step.timeout && step.timeout > 0) {
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Step "${step.id}" timed out`)), step.timeout));
                    output = await Promise.race([
                        step.execute(depOutputs, context),
                        timeoutPromise,
                    ]);
                }
                else {
                    output = await step.execute(depOutputs, context);
                }
                return {
                    stepId: step.id,
                    status: 'completed',
                    output,
                    duration: Date.now() - startTime,
                    retries,
                };
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                retries = attempt + 1;
                if (attempt < maxRetries) {
                    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        return {
            stepId: step.id,
            status: 'failed',
            error: lastError,
            duration: Date.now() - startTime,
            retries,
        };
    }
    chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }
}
/** Helper: create a flow step */
export function createStep(id, name, execute, options) {
    return {
        id,
        name,
        execute,
        description: options?.description,
        condition: options?.condition,
        dependsOn: options?.dependsOn,
        maxRetries: options?.maxRetries,
        timeout: options?.timeout,
    };
}
//# sourceMappingURL=flow.js.map