export interface WorkflowStep {
    id: string;
    name: string;
    execute: (state: any) => Promise<any>;
    dependsOn?: string[];
}
export interface WorkflowCallbacks {
    onStart?: (workflowName: string, initialState: any) => void | Promise<void>;
    onStepStart?: (stepId: string, stepName: string) => void | Promise<void>;
    onStepFinish?: (stepId: string, stepName: string, result: any, durationMs: number) => void | Promise<void>;
    onFinish?: (state: any, durationMs: number) => void | Promise<void>;
    onError?: (stepId: string | null, error: Error) => void | Promise<void>;
}
export declare class WorkflowAgent {
    readonly name: string;
    private steps;
    private state;
    constructor(name: string, initialConfig?: {
        steps?: WorkflowStep[];
        state?: any;
    });
    addStep(step: WorkflowStep): this;
    getState(): Record<string, any>;
    setState(state: Record<string, any>): void;
    run(callbacks?: WorkflowCallbacks): Promise<Record<string, any>>;
}
//# sourceMappingURL=engine.d.ts.map