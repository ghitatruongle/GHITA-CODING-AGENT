// ==============================================================================
// GHITA CODING AGENT - Smart Routing Types
// Phase 1.4
// ==============================================================================

import type { AIProviderType } from '@ghita/shared';

export type RoutingStrategy = 'cost-first' | 'quality-first' | 'balanced' | 'latency-first';

export interface RoutingDecision {
  provider: AIProviderType;
  model: string;
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
  qualityScore: number;
}

export interface RoutingConfig {
  strategy: RoutingStrategy;
  maxCostPerRequest?: number;
  maxLatencyMs?: number;
  minQualityScore?: number;
  budgetRemaining?: number;
}

export interface ProviderMetrics {
  provider: AIProviderType;
  model: string;
  avgLatencyMs: number;
  successRate: number;
  avgCostPer1kTokens: number;
  qualityScore: number;
  lastUpdated: number;
}
