// ==============================================================================
// Phase 33: Rate Limiting & Quotas — Type Definitions
// ==============================================================================

/**
 * Window type cho rate limit.
 */
export type RateLimitWindow = 'second' | 'minute' | 'hour' | 'day' | 'month';

/**
 * Rate limit spec — giới hạn số request/token trong 1 cửa sổ thời gian.
 *
 * Ví dụ:
 *   { limit: 60, window: 'minute' } → tối đa 60 request/phút
 *   { limit: 100000, window: 'day', scope: 'tokens' } → 100K tokens/ngày
 */
export interface RateLimit {
  /** Identifier (vd: 'chat.requests', 'embed.tokens') */
  id: string;
  /** Giới hạn số lượng */
  limit: number;
  /** Cửa sổ thời gian */
  window: RateLimitWindow;
  /** Scope: request count hay token count */
  scope: 'requests' | 'tokens';
  /** Mô tả */
  description?: string;
}

/**
 * Quota — giới hạn tổng (vd: gói Free 100K token/tháng).
 */
export interface Quota {
  /** User ID */
  userId: string;
  /** Plan name (vd: 'free', 'pro', 'enterprise') */
  plan: string;
  /** Tổng token cho phép trong window (vd: 100000 tokens/tháng) */
  tokenLimit: number;
  /** Cửa sổ reset (vd: 'month') */
  window: RateLimitWindow;
  /** Reset timestamp (epoch ms) */
  resetAt: number;
  /** Overage policy khi vượt quota */
  overage: OveragePolicy;
}

/**
 * Overage policy — hành vi khi user vượt quota.
 */
export interface OveragePolicy {
  /** Cho phép vượt quota (hard cap) */
  allowOverage: boolean;
  /** Giới hạn overage tối đa (vd: 20% của quota) */
  maxOveragePercent: number;
  /** Giá overage (USD per 1K tokens) */
  overagePricePer1k: number;
  /** Callback khi trigger overage billing */
  onOverage?: (event: OverageEvent) => void | Promise<void>;
  /** Có block request khi đạt max overage không */
  blockAtMax: boolean;
}

/**
 * Event khi user vượt quota.
 */
export interface OverageEvent {
  /** User ID */
  userId: string;
  /** Plan */
  plan: string;
  /** Token đã dùng */
  tokensUsed: number;
  /** Quota gốc */
  tokenLimit: number;
  /** Over tokens (vượt quota) */
  overageTokens: number;
  /** Giá trị billing (USD) */
  billingAmount: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Usage record — 1 lần sử dụng.
 */
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
  /** Cho phép đi tiếp? */
  allowed: boolean;
  /** Limit đã config */
  limit: number;
  /** Số còn lại */
  remaining: number;
  /** Reset timestamp (epoch ms) */
  resetAt: number;
  /** Retry sau (ms) — chỉ có khi !allowed */
  retryAfterMs?: number;
  /** Scope */
  scope: 'requests' | 'tokens';
}

/**
 * Quota check result.
 */
export interface QuotaCheckResult {
  /** Cho phép đi tiếp? */
  allowed: boolean;
  /** Quota */
  quota: Quota;
  /** Token đã dùng */
  tokensUsed: number;
  /** Token còn lại (chưa tính overage) */
  tokensRemaining: number;
  /** Có đang trong overage không */
  inOverage: boolean;
  /** Token overage (nếu có) */
  overageTokens: number;
  /** Cost overage (USD) */
  overageCost: number;
  /** Lý do (nếu blocked) */
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
  /** Tổng request */
  totalRequests: number;
  /** Tổng tokens */
  totalTokens: number;
  /** Tổng cost (USD) */
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
  /** Bảng giá model (USD per 1K tokens) */
  pricing: Record<string, ModelPricing>;
  /** Logger */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}
