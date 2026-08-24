// Public API for the Adaptive Router subsystem

// --- Adaptive Router (complexity-based model selection) ---
export { AdaptiveRouter } from './adaptive.js';
export type {
  AdaptiveRouterConfig,
  ComplexityTier,
  ComplexityAnalysis,
  ComplexityFactors,
  ModelClass,
} from './adaptive.js';

// --- Provider Recommendation System ---
export { ProviderRecommendationSystem } from './recommend.js';
export type {
  TaskType,
  ProviderRecommendation,
  RecommendationResult,
  RecommendationConfig,
} from './recommend.js';

// --- Dynamic Fallback Router ---
export { DynamicFallbackRouter } from './fallback.js';
export type {
  DynamicFallbackConfig,
  FallbackTarget,
  FallbackResult,
  AttemptRecord,
  CircuitState,
  CircuitBreakerStatus,
  CircuitBreakerConfig,
  RetryPolicy,
} from './fallback.js';

// --- Unified Router (existing, re-exported for convenience) ---
export { UnifiedRouter } from './unifiedRouter.js';
export type { UnifiedRouterOptions, LatencyMetric } from './unifiedRouter.js';
