export type ComplexityLevel = 'simple' | 'medium' | 'high';
export interface RouteResolution {
    provider: string;
    model: string;
    complexity: ComplexityLevel;
    reason: string;
    estimatedCostUsd: number;
}
export declare class AgentRouter {
    private maxCostThreshold;
    private boundaryMode;
    constructor(maxCostThreshold?: number, boundaryMode?: string);
    /**
     * Analyze prompt strings to heuristically estimate complexity level
     */
    estimateComplexity(prompt: string): ComplexityLevel;
    /**
     * Resolve best provider and model based on estimated complexity
     */
    resolveRoute(prompt: string): RouteResolution;
    setMaxCostThreshold(threshold: number): void;
    setBoundaryMode(mode: string): void;
}
//# sourceMappingURL=router.d.ts.map