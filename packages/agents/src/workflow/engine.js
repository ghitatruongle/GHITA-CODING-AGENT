// ==============================================================================
// GHITA CODING AGENT - Workflow Agent Engine
// ==============================================================================
export class WorkflowAgent {
    name;
    steps = [];
    state = {};
    constructor(name, initialConfig) {
        this.name = name;
        if (initialConfig?.steps)
            this.steps = initialConfig.steps;
        if (initialConfig?.state)
            this.state = { ...initialConfig.state };
    }
    addStep(step) {
        this.steps.push(step);
        return this;
    }
    getState() {
        return this.state;
    }
    setState(state) {
        this.state = { ...state };
    }
    async run(callbacks = {}) {
        const startTime = Date.now();
        try {
            if (callbacks.onStart) {
                await Promise.resolve(callbacks.onStart(this.name, this.state));
            }
            const executed = new Set();
            const inProgress = new Set();
            const executeStepWithDeps = async (step) => {
                if (executed.has(step.id))
                    return;
                if (inProgress.has(step.id))
                    throw new Error(`Circular dependency detected at step ${step.id}`);
                inProgress.add(step.id);
                // Resolve dependencies first
                if (step.dependsOn) {
                    for (const depId of step.dependsOn) {
                        const depStep = this.steps.find((s) => s.id === depId);
                        if (depStep) {
                            await executeStepWithDeps(depStep);
                        }
                    }
                }
                if (callbacks.onStepStart) {
                    await Promise.resolve(callbacks.onStepStart(step.id, step.name));
                }
                const stepStartTime = Date.now();
                try {
                    const result = await step.execute(this.state);
                    this.state[step.id] = result;
                    const duration = Date.now() - stepStartTime;
                    if (callbacks.onStepFinish) {
                        await Promise.resolve(callbacks.onStepFinish(step.id, step.name, result, duration));
                    }
                }
                catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    if (callbacks.onError) {
                        await Promise.resolve(callbacks.onError(step.id, err));
                    }
                    throw err;
                }
                inProgress.delete(step.id);
                executed.add(step.id);
            };
            for (const step of this.steps) {
                await executeStepWithDeps(step);
            }
            const totalDuration = Date.now() - startTime;
            if (callbacks.onFinish) {
                await Promise.resolve(callbacks.onFinish(this.state, totalDuration));
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (callbacks.onError) {
                await Promise.resolve(callbacks.onError(null, err));
            }
            throw err;
        }
        return this.state;
    }
}
//# sourceMappingURL=engine.js.map