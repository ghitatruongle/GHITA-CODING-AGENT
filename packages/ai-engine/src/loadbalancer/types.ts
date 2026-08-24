// Round-robin + weighted routing with health checks, rate limiting, and
// automatic failover across LLM providers.

import type { AIProviderType, AIStreamChunk } from '@ghita/shared';
import type { ChatMessage, ChatOptions, ChatResponse } from '../types.js';

// Routing strategy

/**
 * - 'round-robin': cycle through healthy providers
 * - 'weighted':   choose by weight (higher = more traffic)
 * - 'least-loaded': pick the provider with the lowest active request count
 * - 'fastest':    pick the provider with lowest average latency
 * - 'priority':   prefer the first healthy provider in declaration order
 */
export type LoadBalancingStrategy =
  | 'round-robin'
  | 'weighted'
  | 'least-loaded'
  | 'fastest'
  | 'priority';

// Provider endpoint / pool entry

/** A single provider endpoint in the load-balanced pool. */
export interface LoadBalancedProvider {
  /** Unique ID inside the pool, e.g. "openai:gpt-4o:1" */
  id: string;
  /** Provider type */
  type: AIProviderType;
  /** Optional model override (some providers support multiple models) */
  model?: string;
  /** Routing weight (default 1). Higher = more requests. */
  weight: number;
  /** Priority tier (lower = higher priority). Used by 'priority' strategy. */
  priority: number;
  /** Whether this endpoint is administratively enabled. */
  enabled: boolean;
  /** Optional explicit base URL */
  baseUrl?: string;
  /** Optional API key override (otherwise inherited from pool config) */
  apiKey?: string;
  /** Per-provider rate limit (requests/minute). 0 = unlimited. */
  rateLimitPerMinute: number;
  /** Tags for filtering (e.g. 'fast', 'cheap', 'vision') */
  tags: string[];
  /** Optional cost per 1K tokens (USD) for preference */
  costPer1k?: number;
}

// Health check

export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckConfig {
  /** Enable background health checks (default: true) */
  enabled: boolean;
  /** Interval between health checks in ms (default: 30_000) */
  intervalMs: number;
  /** Health check timeout in ms (default: 5_000) */
  timeoutMs: number;
  /** How many consecutive failures = unhealthy (default: 3) */
  failureThreshold: number;
  /** How many consecutive successes = healthy (default: 1) */
  successThreshold: number;
  /** Path/endpoint used for health probe (default '/models') */
  endpoint: string;
  /** Custom HTTP method (default 'GET') */
  method: 'GET' | 'HEAD' | 'POST';
  /** Custom headers to include in health probe */
  headers?: Record<string, string>;
}

export const DEFAULT_HEALTH_CONFIG: Required<HealthCheckConfig> = {
  enabled: true,
  intervalMs: 30_000,
  timeoutMs: 5_000,
  failureThreshold: 3,
  successThreshold: 1,
  endpoint: '/models',
  method: 'GET',
  headers: {},
};

export interface HealthSnapshot {
  providerId: string;
  state: HealthState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError?: string;
  /** Most recent latency in ms */
  lastLatencyMs: number | null;
  /** EMA latency in ms */
  averageLatencyMs: number;
}

// Rate limiter

export interface RateLimiterConfig {
  /** Window size in ms (default 60_000 = 1 minute) */
  windowMs: number;
  /** Max requests per window per provider (default 60) */
  maxRequests: number;
  /** Burst capacity (default: same as maxRequests) */
  burstCapacity: number;
}

export const DEFAULT_RATE_LIMITER_CONFIG: Required<RateLimiterConfig> = {
  windowMs: 60_000,
  maxRequests: 60,
  burstCapacity: 60,
};

export interface RateLimitState {
  providerId: string;
  windowStart: number;
  requestCount: number;
  tokensRemaining: number;
  /** Time when next token will be available (ms since epoch) */
  nextRefillAt: number;
}

// Load Balancer Configuration

export interface LoadBalancerConfig {
  /** Routing strategy (default: 'weighted') */
  strategy: LoadBalancingStrategy;
  /** Pool of provider endpoints */
  providers: LoadBalancedProvider[];
  /** Health check config */
  healthCheck: Partial<HealthCheckConfig>;
  /** Default rate limit (per-provider) */
  rateLimiter: Partial<RateLimiterConfig>;
  /** Failover policy: what to do when all providers are unhealthy */
  failover: FailoverPolicy;
  /** Whether to automatically re-enable a provider once it recovers (default: true) */
  autoRecover: boolean;
}

export const DEFAULT_LOAD_BALANCER_CONFIG: Omit<LoadBalancerConfig, 'providers'> = {
  strategy: 'weighted',
  healthCheck: {},
  rateLimiter: {},
  failover: {
    mode: 'queue',
    queueTimeoutMs: 10_000,
    maxRetries: 2,
    retryDelayMs: 500,
  },
  autoRecover: true,
};

// Failover

export type FailoverMode = 'queue' | 'reject' | 'next-best' | 'circuit-break';

export interface FailoverPolicy {
  /** What to do when no provider is currently available */
  mode: FailoverMode;
  /** How long to queue when mode='queue' (ms) */
  queueTimeoutMs: number;
  /** Max retries per request (default: 2) */
  maxRetries: number;
  /** Base delay between retries (ms) */
  retryDelayMs: number;
}

// Routing decision

export interface RoutingDecision {
  /** Chosen provider endpoint */
  provider: LoadBalancedProvider;
  /** Why this provider was chosen */
  reason:
    | 'round-robin'
    | 'weighted-random'
    | 'least-loaded'
    | 'fastest-ema'
    | 'priority-order'
    | 'failover'
    | 'only-healthy';
  /** Latency at decision time (ms) */
  decisionLatencyMs: number;
  /** Number of candidates considered */
  candidates: number;
  /** Snapshot of pool state at decision time */
  poolSnapshot: string[];
}

// Request & Result types

export interface LoadBalancedRequest {
  id: string;
  messages: ChatMessage[];
  options?: ChatOptions;
  /** Optional tag filter — only providers with this tag are eligible */
  tag?: string;
  /** Optional preferred provider id */
  preferProviderId?: string;
  /** Optional provider type filter */
  providerType?: AIProviderType;
  /** Timeout for the entire request (ms) */
  timeoutMs?: number;
  /** AbortSignal */
  signal?: AbortSignal;
  enqueuedAt: number;
}

export interface LoadBalancedResult {
  requestId: string;
  ok: boolean;
  response?: ChatResponse;
  chunks?: AsyncGenerator<AIStreamChunk>;
  error?: Error;
  routingDecision: RoutingDecision;
  attempts: LoadBalancedAttempt[];
  totalDurationMs: number;
}

export interface LoadBalancedAttempt {
  providerId: string;
  ok: boolean;
  error?: Error;
  startedAt: number;
  durationMs: number;
  /** Was this attempt skipped because of rate limit or health? */
  skipped?: 'rate-limit' | 'unhealthy' | 'disabled' | 'tag-mismatch';
}

// Provider adapter for the load balancer

/**
 * Mirrors the part of AIProvider used by the load balancer. Allows the
 * caller to wire in any compatible provider without coupling to the
 * full AIProvider interface.
 */
export interface LoadBalancedAdapter {
  readonly type: AIProviderType;
  /** Make a chat call to this provider. */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  /** Optional streaming call. */
  chatStream?(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<AIStreamChunk>;
  /** Probe /models endpoint for health check. Should throw on failure. */
  healthCheck?(timeoutMs: number): Promise<void>;
}

// Events

export type LoadBalancerEvent =
  | { type: 'health-changed'; providerId: string; state: HealthState; previous: HealthState }
  | { type: 'rate-limited'; providerId: string; retryAfterMs: number }
  | { type: 'provider-disabled'; providerId: string; reason: string }
  | { type: 'provider-enabled'; providerId: string }
  | { type: 'failover'; fromProviderId: string; toProviderId: string; reason: string }
  | { type: 'request-completed'; requestId: string; result: LoadBalancedResult }
  | { type: 'all-providers-down'; at: number };

export type LoadBalancerEventListener = (event: LoadBalancerEvent) => void;

// Load Balancer Stats

export interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  failoverCount: number;
  rateLimitedCount: number;
  averageLatencyMs: number;
  averageDecisionLatencyMs: number;
  /** Per-provider stats */
  providers: Array<{
    id: string;
    type: AIProviderType;
    state: HealthState;
    requests: number;
    successes: number;
    failures: number;
    averageLatencyMs: number;
    rateLimit: RateLimitState | null;
  }>;
  uptimeMs: number;
}
