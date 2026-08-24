/**
 * Window type cho rate limit.
 */
export type RateLimitWindow = 'second' | 'minute' | 'hour' | 'day' | 'month';

export interface RateLimit {
  /** Identifier (vd: 'chat.requests', 'embed.tokens') */
  id: string;
  
  limit: number;
  
  window: RateLimitWindow;
  /** Scope: request count hay token count */
  scope: 'requests' | 'tokens';
  
  description?: string;
}

export interface Quota {
  /** User ID */
  userId: string;
  /** Plan name (vd: 'free', 'pro', 'enterprise') */
  plan: string;
  
  tokenLimit: number;
  
  window: RateLimitWindow;
  /** Reset timestamp (epoch ms) */
  resetAt: number;
  
  overage: OveragePolicy;
}

export interface OveragePolicy {
  
  allowOverage: boolean;
  
  maxOveragePercent: number;
  
  overagePricePer1k: number;
  /** Callback khi trigger overage billing */
  onOverage?: (event: OverageEvent) => void | Promise<void>;
  
  blockAtMax: boolean;
}

export interface OverageEvent {
  /** User ID */
  userId: string;
  /** Plan */
  plan: string;
  
  tokensUsed: number;
  
  tokenLimit: number;
  
  overageTokens: number;
  
  billingAmount: number;
  /** Timestamp */
  timestamp: number;
}

export interface UsageRecord {
  /** Record ID */
  id: string;
  /** User ID */
  userId: string;
  /** Provider */
  provider: string;
  /** Model */
  model: string;
  /** Prompt tokens */
  promptTokens: number;
  /** Completion tokens */
  completionTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Cost (USD) */
  costUsd: number;
  /** Timestamp */
  timestamp: number;
  /** Session ID */
  sessionId?: string;
  /** Request ID */
  requestId?: string;
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  
  allowed: boolean;
  
  limit: number;
  
  remaining: number;
  /** Reset timestamp (epoch ms) */
  resetAt: number;
  
  retryAfterMs?: number;
  /** Scope */
  scope: 'requests' | 'tokens';
}

/**
 * Quota check result.
 */
export interface QuotaCheckResult {
  
  allowed: boolean;
  /** Quota */
  quota: Quota;
  
  tokensUsed: number;
  
  tokensRemaining: number;
  
  inOverage: boolean;
  
  overageTokens: number;
  /** Cost overage (USD) */
  overageCost: number;
  
  blockReason?: 'quota_exceeded' | 'overage_cap_reached';
}

/**
 * Usage dashboard summary.
 */
export interface UsageSummary {
  /** User ID */
  userId: string;
  /** Period start */
  periodStart: number;
  /** Period end */
  periodEnd: number;
  
  totalRequests: number;
  
  totalTokens: number;
  
  totalCost: number;
  /** Breakdown theo provider */
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
  /** Breakdown theo model */
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
}

/**
 * Pricing per 1K tokens (USD).
 */
export interface ModelPricing {
  /** Prompt price per 1K tokens */
  promptPer1k: number;
  /** Completion price per 1K tokens */
  completionPer1k: number;
}

/**
 * Quota manager config.
 */
export interface QuotaConfig {
  
  pricing: Record<string, ModelPricing>;
  /** Logger */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}
