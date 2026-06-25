// ==============================================================================
// GHITA CODING AGENT - Load Balancer Module Barrel (Phase 28)
// ==============================================================================

// --- Types ---
export type {
  LoadBalancingStrategy,
  LoadBalancedProvider,
  HealthState,
  HealthCheckConfig,
  HealthSnapshot,
  RateLimiterConfig,
  RateLimitState,
  FailoverMode,
  FailoverPolicy,
  LoadBalancerConfig,
  LoadBalancedRequest,
  LoadBalancedResult,
  LoadBalancedAttempt,
  LoadBalancedAdapter,
  RoutingDecision,
  LoadBalancerEvent,
  LoadBalancerEventListener,
  LoadBalancerStats,
} from './types.js';
export {
  DEFAULT_LOAD_BALANCER_CONFIG,
  DEFAULT_HEALTH_CONFIG,
  DEFAULT_RATE_LIMITER_CONFIG,
} from './types.js';

// --- Building blocks ---
export { RateLimiter } from './rate-limiter.js';
export { HealthChecker } from './health-checker.js';
export { filterEligible, pickProvider } from './router.js';

// --- Main engine ---
export { LoadBalancer } from './load-balancer.js';
