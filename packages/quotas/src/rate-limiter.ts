// ==============================================================================
// Phase 33: Rate Limiter (token-bucket per user)
// ==============================================================================

import type { RateLimit, RateLimitResult, RateLimitWindow } from './types.js';

interface Bucket {
  /** Token còn lại (cho token-bucket) */
  tokens: number;
  /** Last refill timestamp */
  lastRefill: number;
}

/**
 * RateLimiter — token-bucket algorithm với sliding refill.
 *
 * Mỗi user có 1 bucket cho mỗi rate limit spec.
 * Hỗ trợ cả request-count và token-count.
 *
 * Sử dụng:
 *   const limiter = new RateLimiter();
 *   const result = limiter.check('user-1', { id: 'chat.req', limit: 60, window: 'minute', scope: 'requests' });
 *   if (!result.allowed) throw new Error(`Rate limited, retry after ${result.retryAfterMs}ms`);
 */
export class RateLimiter {
  /** Key: `${userId}:${limitId}` */
  private readonly buckets = new Map<string, Bucket>();
  /** Config registry */
  private readonly limits = new Map<string, RateLimit>();
  private totalChecks = 0;
  private totalBlocked = 0;

  /**
   * Đăng ký rate limit spec.
   */
  registerLimit(limit: RateLimit): void {
    this.limits.set(limit.id, limit);
  }

  /**
   * List all registered rate limit specs.
   */
  listLimits(): RateLimit[] {
    return Array.from(this.limits.values());
  }

  /**
   * Xóa rate limit spec.
   */
  unregisterLimit(id: string): boolean {
    this.limits.delete(id);
    return true;
  }

  /**
   * Check rate limit cho user, có thể dùng atomicConsume.
   * Nếu cost=1 thì check trước, consume nếu allowed.
   */
  check(userId: string, limitId: string, cost = 1): RateLimitResult {
    this.totalChecks++;
    const limit = this.limits.get(limitId);
    if (!limit) {
      return {
        allowed: true,
        limit: Infinity,
        remaining: Infinity,
        resetAt: 0,
        scope: limitId.includes('token') ? 'tokens' : 'requests',
      };
    }

    const windowMs = windowToMs(limit.window);
    const key = `${userId}:${limitId}`;
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit.limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill: proportional refill dựa trên thời gian trôi qua
    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      const refillRate = limit.limit / windowMs;
      const refill = Math.floor(elapsed * refillRate);
      if (refill > 0) {
        bucket.tokens = Math.min(limit.limit, bucket.tokens + refill);
        bucket.lastRefill = now;
      }
    }

    const resetAt = bucket.lastRefill + windowMs;
    const remaining = Math.max(0, Math.floor(bucket.tokens));

    if (bucket.tokens < cost) {
      this.totalBlocked++;
      const deficit = cost - bucket.tokens;
      const refillRate = limit.limit / windowMs;
      const retryAfterMs = refillRate > 0 ? Math.ceil(deficit / refillRate) : windowMs;
      return {
        allowed: false,
        limit: limit.limit,
        remaining,
        resetAt,
        retryAfterMs,
        scope: limit.scope,
      };
    }

    bucket.tokens -= cost;
    return {
      allowed: true,
      limit: limit.limit,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      resetAt,
      scope: limit.scope,
    };
  }

  /**
   * Reset bucket cho user (vd: sau khi admin manually grant).
   */
  reset(userId: string, limitId?: string): void {
    if (limitId) {
      this.buckets.delete(`${userId}:${limitId}`);
    } else {
      const prefix = `${userId}:`;
      for (const key of this.buckets.keys()) {
        if (key.startsWith(prefix)) this.buckets.delete(key);
      }
    }
  }

  /**
   * Lấy remaining tokens cho user (không consume).
   */
  peek(userId: string, limitId: string): number {
    const limit = this.limits.get(limitId);
    if (!limit) return Infinity;
    const key = `${userId}:${limitId}`;
    const bucket = this.buckets.get(key);
    if (!bucket) return limit.limit;
    return Math.max(0, Math.floor(bucket.tokens));
  }

  /**
   * Stats tổng quan.
   */
  stats(): {
    totalChecks: number;
    totalBlocked: number;
    uniqueUsers: number;
    registeredLimits: number;
  } {
    const userSet = new Set<string>();
    for (const key of this.buckets.keys()) {
      const userId = key.split(':')[0];
      if (userId) userSet.add(userId);
    }
    return {
      totalChecks: this.totalChecks,
      totalBlocked: this.totalBlocked,
      uniqueUsers: userSet.size,
      registeredLimits: this.limits.size,
    };
  }

  /**
   * Clear tất cả bucket (test only).
   */
  clear(): void {
    this.buckets.clear();
    this.totalChecks = 0;
    this.totalBlocked = 0;
  }
}

function windowToMs(window: RateLimitWindow): number {
  switch (window) {
    case 'second':
      return 1000;
    case 'minute':
      return 60 * 1000;
    case 'hour':
      return 60 * 60 * 1000;
    case 'day':
      return 24 * 60 * 60 * 1000;
    case 'month':
      return 30 * 24 * 60 * 60 * 1000;
  }
}
