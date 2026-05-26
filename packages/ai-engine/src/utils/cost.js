// ==============================================================================
// GHITA CODING AGENT - Cost & Budget Management (STT 2.4, 2.5)
// ==============================================================================
import { AIBudgetExceededError } from '../errors/index.js';
// ------------------------------------------------------------------------------
// Pricing Table Configs
// ------------------------------------------------------------------------------
export const DEFAULT_PRICING_TABLE = {
    'gpt-4o': { inputCostPer1k: 0.005, outputCostPer1k: 0.015 },
    'gpt-4-turbo': { inputCostPer1k: 0.01, outputCostPer1k: 0.03 },
    'gpt-3.5-turbo': { inputCostPer1k: 0.0005, outputCostPer1k: 0.0015 },
    'claude-3-5-sonnet': { inputCostPer1k: 0.003, outputCostPer1k: 0.015 },
    'claude-3-opus': { inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
    'claude-3-haiku': { inputCostPer1k: 0.00025, outputCostPer1k: 0.00125 },
    'gemini-1.5-pro': { inputCostPer1k: 0.007, outputCostPer1k: 0.021 },
    'gemini-1.5-flash': { inputCostPer1k: 0.00035, outputCostPer1k: 0.00105 },
    'deepseek-chat': { inputCostPer1k: 0.00014, outputCostPer1k: 0.00028 },
    'deepseek-coder': { inputCostPer1k: 0.00014, outputCostPer1k: 0.00028 },
    'ollama': { inputCostPer1k: 0, outputCostPer1k: 0 },
};
export const FALLBACK_PRICING = {
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.006,
};
// Helper to resolve pricing for a model (partial name matching)
export function getModelPricing(modelName, pricingTable = DEFAULT_PRICING_TABLE) {
    const normalized = modelName.toLowerCase();
    for (const [key, pricing] of Object.entries(pricingTable)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return pricing;
        }
    }
    return FALLBACK_PRICING;
}
// ------------------------------------------------------------------------------
// 2.4 Cost Tracker
// ------------------------------------------------------------------------------
export class CostTracker {
    totalCost = 0;
    pricingTable;
    constructor(customPricingTable) {
        this.pricingTable = customPricingTable || DEFAULT_PRICING_TABLE;
    }
    calculateCost(model, promptTokens, completionTokens) {
        const pricing = getModelPricing(model, this.pricingTable);
        const inputCost = (promptTokens / 1000) * pricing.inputCostPer1k;
        const outputCost = (completionTokens / 1000) * pricing.outputCostPer1k;
        return inputCost + outputCost;
    }
    async trackCost(model, promptTokens, completionTokens) {
        const cost = this.calculateCost(model, promptTokens, completionTokens);
        this.totalCost += cost;
        return cost;
    }
    getTotalCost() {
        return this.totalCost;
    }
    reset() {
        this.totalCost = 0;
    }
}
export class BudgetManager {
    spent = 0;
    limit;
    period;
    onAlert;
    alertThresholds;
    triggeredThresholds = new Set();
    constructor(options) {
        this.limit = options.limit;
        this.period = options.period || 'monthly';
        this.onAlert = options.onAlert;
        this.alertThresholds = options.alertThresholds || [0.8, 1.0];
    }
    getLimit() {
        return this.limit;
    }
    setLimit(limit) {
        this.limit = limit;
        this.resetTriggeredThresholds();
    }
    getCurrentSpent() {
        return this.spent;
    }
    checkBudget(estimatedNewCost = 0) {
        if (this.spent + estimatedNewCost > this.limit) {
            throw new AIBudgetExceededError(this.limit, this.spent + estimatedNewCost, this.period);
        }
    }
    recordSpent(amount) {
        const newSpent = this.spent + amount;
        this.spent = newSpent;
        if (this.onAlert && this.limit > 0) {
            const percentage = newSpent / this.limit;
            for (const threshold of this.alertThresholds) {
                if (percentage >= threshold && !this.triggeredThresholds.has(threshold)) {
                    this.triggeredThresholds.add(threshold);
                    try {
                        this.onAlert(newSpent, this.limit, percentage);
                    }
                    catch (err) {
                        // Ignore callback failures
                    }
                }
            }
        }
    }
    resetSpent() {
        this.spent = 0;
        this.resetTriggeredThresholds();
    }
    resetTriggeredThresholds() {
        this.triggeredThresholds.clear();
    }
}
//# sourceMappingURL=cost.js.map