export interface ModelPricing {
    inputCostPer1k: number;
    outputCostPer1k: number;
}
export declare const DEFAULT_PRICING_TABLE: Record<string, ModelPricing>;
export declare const FALLBACK_PRICING: ModelPricing;
export declare function getModelPricing(modelName: string, pricingTable?: Record<string, ModelPricing>): ModelPricing;
export declare class CostTracker {
    private totalCost;
    private pricingTable;
    constructor(customPricingTable?: Record<string, ModelPricing>);
    calculateCost(model: string, promptTokens: number, completionTokens: number): number;
    trackCost(model: string, promptTokens: number, completionTokens: number): Promise<number>;
    getTotalCost(): number;
    reset(): void;
}
export interface BudgetOptions {
    limit: number;
    period?: 'daily' | 'weekly' | 'monthly';
    onAlert?: (spent: number, limit: number, percentage: number) => void;
    alertThresholds?: number[];
}
export declare class BudgetManager {
    private spent;
    private limit;
    private period;
    private onAlert?;
    private alertThresholds;
    private triggeredThresholds;
    constructor(options: BudgetOptions);
    getLimit(): number;
    setLimit(limit: number): void;
    getCurrentSpent(): number;
    checkBudget(estimatedNewCost?: number): void;
    recordSpent(amount: number): void;
    resetSpent(): void;
    private resetTriggeredThresholds;
}
//# sourceMappingURL=cost.d.ts.map