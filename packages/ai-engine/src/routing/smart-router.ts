// ==============================================================================
// GHITA CODING AGENT - Smart Router
// Phase 1.4: Cost/quality/latency-based provider routing
// ==============================================================================

import type { AIProviderType } from '@ghita/shared';
import type { RoutingStrategy, RoutingDecision, RoutingConfig, ProviderMetrics } from './types.js';

// Pre-assigned quality scores by model family
const QUALITY_SCORES: Record<string, number> = {
  // Top tier
  'gpt-4o': 0.95, 'claude-opus': 0.95, 'gemini-2.0-flash': 0.90,
  'claude-sonnet-4': 0.92, 'claude-sonnet': 0.92,
  // High tier
  'gpt-4-turbo': 0.90, 'claude-3-5-haiku': 0.80, 'claude-3-opus': 0.93,
  'gemini-1.5-pro': 0.88, 'deepseek-chat': 0.82,
  // Mid tier
  'gpt-4o-mini': 0.80, 'gemini-1.5-flash': 0.78,
  'mistral-large': 0.82, 'command-r-plus': 0.80, 'grok-beta': 0.80,
  // Fast/cheap
  'gpt-3.5-turbo': 0.70, 'llama-3.1-70b': 0.75, 'llama-3.1-8b': 0.60,
  'mistral-medium': 0.72, 'mixtral-8x7b': 0.72,
  // Specialized
  'jamba-1.5-large': 0.78, 'voyage-3': 0.70,
};

export class SmartRouter {
  private config: RoutingConfig;
  private metrics = new Map<string, ProviderMetrics>();

  constructor(config: RoutingConfig) {
    this.config = config;
  }

  /** Route a request to the best provider/model */
  route(availableProviders: Array<{ type: AIProviderType; model: string }>): RoutingDecision | null {
    if (availableProviders.length === 0) return null;

    const scored = availableProviders.map((p) => {
      const key = `${p.type}:${p.model}`;
      const m = this.metrics.get(key);
      return {
        provider: p.type,
        model: p.model,
        quality: this.getQualityScore(p.model, m),
        cost: m?.avgCostPer1kTokens ?? this.estimateDefaultCost(p.model),
        latency: m?.avgLatencyMs ?? 5000,
        successRate: m?.successRate ?? 1.0,
      };
    });

    // Apply filters
    const filtered = scored.filter((s) => {
      if (this.config.maxCostPerRequest && s.cost > this.config.maxCostPerRequest) return false;
      if (this.config.maxLatencyMs && s.latency > this.config.maxLatencyMs) return false;
      if (this.config.minQualityScore && s.quality < this.config.minQualityScore) return false;
      return true;
    });

    const pool = filtered.length > 0 ? filtered : scored;

    // Sort by strategy
    let sorted: typeof pool;
    let reason: string;

    switch (this.config.strategy) {
      case 'cost-first':
        sorted = pool.sort((a, b) => a.cost - b.cost);
        reason = 'Lowest cost';
        break;
      case 'quality-first':
        sorted = pool.sort((a, b) => b.quality - a.quality);
        reason = 'Highest quality';
        break;
      case 'latency-first':
        sorted = pool.sort((a, b) => a.latency - b.latency);
        reason = 'Lowest latency';
        break;
      case 'balanced':
      default:
        sorted = pool.sort((a, b) => {
          const scoreA = a.quality * 0.4 + (1 - this.normalizeCost(a.cost, pool)) * 0.3 + (1 - this.normalizeLatency(a.latency, pool)) * 0.3;
          const scoreB = b.quality * 0.4 + (1 - this.normalizeCost(b.cost, pool)) * 0.3 + (1 - this.normalizeLatency(b.latency, pool)) * 0.3;
          return scoreB - scoreA;
        });
        reason = 'Balanced (quality 40%, cost 30%, latency 30%)';
        break;
    }

    const best = sorted[0]!;
    return {
      provider: best.provider,
      model: best.model,
      reason,
      estimatedCost: best.cost,
      estimatedLatency: best.latency,
      qualityScore: best.quality,
    };
  }

  /** Update metrics after a request */
  updateMetrics(provider: AIProviderType, model: string, latencyMs: number, success: boolean, cost: number): void {
    const key = `${provider}:${model}`;
    const existing = this.metrics.get(key);

    if (existing) {
      const n = existing.lastUpdated > 0 ? 2 : 1; // smoothing factor
      existing.avgLatencyMs = (existing.avgLatencyMs + latencyMs) / n;
      existing.avgCostPer1kTokens = (existing.avgCostPer1kTokens + cost) / n;
      existing.successRate = success
        ? (existing.successRate * 0.9 + 0.1)
        : (existing.successRate * 0.9);
      existing.lastUpdated = Date.now();
    } else {
      this.metrics.set(key, {
        provider,
        model,
        avgLatencyMs: latencyMs,
        successRate: success ? 1.0 : 0.0,
        avgCostPer1kTokens: cost,
        qualityScore: this.getQualityScore(model),
        lastUpdated: Date.now(),
      });
    }
  }

  /** Get all metrics */
  getMetrics(): ProviderMetrics[] {
    return Array.from(this.metrics.values());
  }

  /** Update routing config */
  setStrategy(strategy: RoutingStrategy): void {
    this.config.strategy = strategy;
  }

  // --- Private helpers ---

  private getQualityScore(model: string, metrics?: ProviderMetrics): number {
    if (metrics?.qualityScore) return metrics.qualityScore;
    // Match model name to quality score table
    const lower = model.toLowerCase();
    for (const [pattern, score] of Object.entries(QUALITY_SCORES)) {
      if (lower.includes(pattern.toLowerCase())) return score;
    }
    return 0.50; // Unknown models
  }

  private estimateDefaultCost(model: string): number {
    const lower = model.toLowerCase();
    if (lower.includes('gpt-4o-mini') || lower.includes('haiku') || lower.includes('flash')) return 0.0002;
    if (lower.includes('gpt-4o') || lower.includes('sonnet')) return 0.005;
    if (lower.includes('gpt-4') || lower.includes('opus')) return 0.03;
    if (lower.includes('llama') || lower.includes('mistral') || lower.includes('mixtral')) return 0.0006;
    return 0.002; // Default estimate
  }

  private normalizeCost(cost: number, pool: Array<{ cost: number }>): number {
    const max = Math.max(...pool.map((p) => p.cost), 0.001);
    return cost / max;
  }

  private normalizeLatency(latency: number, pool: Array<{ latency: number }>): number {
    const max = Math.max(...pool.map((p) => p.latency), 1);
    return latency / max;
  }
}
