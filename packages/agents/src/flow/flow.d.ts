import type { FlowStep, FlowContext, FlowConfig, FlowRunResult } from './types.js';
/**
 * Flow — Orchestrates multi-step task pipelines with dependencies.
 * Supports sequential, parallel, and DAG-based execution modes.
 * Inspired by CrewAI Flow.
 */
export declare class Flow {
    readonly name: string;
    readonly description?: string;
    private readonly steps;
    private readonly config;
    constructor(config: FlowConfig);
    /** Add a step to the flow */
    addStep<TInput, TOutput>(step: FlowStep<TInput, TOutput>): this;
    /** Remove a step */
    removeStep(id: string): boolean;
    /** Get a step by ID */
    getStep(id: string): FlowStep | undefined;
    /** List all steps */
    listSteps(): FlowStep[];
    /** Execute the flow */
    run(initialState?: Record<string, unknown>): Promise<FlowRunResult>;
    private runSequential;
    private runParallel;
    private runDAG;
    private executeStep;
    private chunkArray;
}
/** Helper: create a flow step */
export declare function createStep<TInput, TOutput>(id: string, name: string, execute: (input: TInput, context: FlowContext) => Promise<TOutput>, options?: {
    description?: string;
    condition?: (context: FlowContext) => boolean | Promise<boolean>;
    dependsOn?: string[];
    maxRetries?: number;
    timeout?: number;
}): FlowStep<TInput, TOutput>;
//# sourceMappingURL=flow.d.ts.map