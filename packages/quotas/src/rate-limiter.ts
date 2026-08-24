import type { RateLimit, RateLimitResult, RateLimitWindow } from './types.js';

interface Bucket {
  
  tokens: number;
  /** Last refill timestamp */
  lastRefill: number;
}

/**

 *

 *

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

  registerLimit(limit: RateLimit): void {
    this.limits.set(limit.id, limit);
  }

  /**
   * List all registered rate limit specs.
   */
  listLimits(): RateLimit[] {
    return Array.from(this.limits.values());
  }

  unregisterLimit(id: string): boolean {
    this.limits.delete(id);
    return true;
  }

  /** Drop buckets idle for >24h so the bucket map cannot grow unboundedly. */
  private evictIdleBuckets(): void {
    if (this.buckets.size < 1024 || (this.totalChecks & 4095) !== 0) return;
    const cutoff = Date.now() - 86_400_000;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) this.buckets.delete(key);
    }
  }

  check(userId: string, limitId: string, cost = 1): RateLimitResult {
    this.totalChecks++;
    const limit = this.limits.get(limitId);
    if (!limit) {
      // Fail CLOSED: an unregistered limit must not grant unlimited quota —
      // a typo or missing registration would otherwise bypass rate limiting.
      return {
        allowed: false,
        limit: 0,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        retryAfterMs: 60_000,
        scope: limitId.includes('token') ? 'tokens' : 'requests',
      };
    }
    this.evictIdleBuckets();

    const windowMs = windowToMs(limit.window);
    const key = `${userId}:${limitId}`;
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit.limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill with fractional carry so `lastRefill` always advances and the
    // reported resetAt stays accurate even for slow rates (<1 token per tick).
    const refillRate = limit.limit / windowMs;
    const accrued = (now - bucket.lastRefill) * refillRate;
    if (accrued >= 1) {
      const whole = Math.floor(accrued);
      bucket.tokens = Math.min(limit.limit, bucket.tokens + whole);
      bucket.lastRefill += whole / refillRate;
    }

    const resetAt = Math.ceil(bucket.lastRefill + windowMs);
    const remaining = Math.max(0, Math.floor(bucket.tokens));

    if (bucket.tokens < cost) {
      this.totalBlocked++;
      const deficit = cost - bucket.tokens;
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

  peek(userId: string, limitId: string): number {
    const limit = this.limits.get(limitId);
    if (!limit) return Infinity;
    const key = `${userId}:${limitId}`;
    const bucket = this.buckets.get(key);
    if (!bucket) return limit.limit;
    return Math.max(0, Math.floor(bucket.tokens));
  }

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
