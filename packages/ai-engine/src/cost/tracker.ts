export interface ModelPricing {
  inputCostPer1k: number; // Cost in USD per 1,000 input/prompt tokens
  outputCostPer1k: number; // Cost in USD per 1,000 output/completion tokens
}

// ------------------------------------------------------------------------------
// Pricing Table Configs
// ------------------------------------------------------------------------------
export const DEFAULT_PRICING_TABLE: Record<string, ModelPricing> = {
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
  ollama: { inputCostPer1k: 0, outputCostPer1k: 0 },
};

export const FALLBACK_PRICING: ModelPricing = {
  inputCostPer1k: 0.002,
  outputCostPer1k: 0.006,
};

// Helper to resolve pricing for a model (partial name matching)
export function getModelPricing(
  modelName: string,
  pricingTable = DEFAULT_PRICING_TABLE,
): ModelPricing {
  const normalized = modelName.toLowerCase();
  for (const [key, pricing] of Object.entries(pricingTable)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return pricing;
    }
  }
  return FALLBACK_PRICING;
}

// ------------------------------------------------------------------------------
// Cost Tracker
// ------------------------------------------------------------------------------
export class CostTracker {
  private totalCost = 0;
  private pricingTable: Record<string, ModelPricing>;

  constructor(customPricingTable?: Record<string, ModelPricing>) {
    this.pricingTable = customPricingTable || DEFAULT_PRICING_TABLE;
  }

  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = getModelPricing(model, this.pricingTable);
    const inputCost = (promptTokens / 1000) * pricing.inputCostPer1k;
    const outputCost = (completionTokens / 1000) * pricing.outputCostPer1k;
    return inputCost + outputCost;
  }

  async trackCost(model: string, promptTokens: number, completionTokens: number): Promise<number> {
    const cost = this.calculateCost(model, promptTokens, completionTokens);
    this.totalCost += cost;
    return cost;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  reset(): void {
    this.totalCost = 0;
  }
}
