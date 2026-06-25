// ==============================================================================
// GHITA CODING AGENT - Per-Provider Rate Limiter (Phase 28)
// Token-bucket based rate limiter with sliding window counters.
// ==============================================================================

import type { RateLimitState, RateLimiterConfig } from './types.js';
import { DEFAULT_RATE_LIMITER_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private state: Map<string, RateLimitState> = new Map();

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
  }

  /**
   * Try to acquire one request slot for a provider.
   * Returns `{ allowed: true }` on success, or
   * `{ allowed: false, retryAfterMs }` if rate-limited.
   */
  tryAcquire(
    providerId: string,
    customLimit?: number,
  ): {
    allowed: boolean;
    retryAfterMs: number;
    state: RateLimitState;
  } {
    const limit = customLimit ?? this.config.maxRequests;
    const burst = Math.min(this.config.burstCapacity, limit);
    const now = Date.now();
    const window = this.config.windowMs;
    const refillRate = limit / window; // tokens per ms

    let s = this.state.get(providerId);
    if (!s) {
      s = {
        providerId,
        windowStart: now,
        requestCount: 0,
        tokensRemaining: burst,
        nextRefillAt: now,
      };
      this.state.set(providerId, s);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - s.windowStart;
    if (elapsed > 0) {
      const refilled = elapsed * refillRate;
      s.tokensRemaining = Math.min(burst, s.tokensRemaining + refilled);
      s.windowStart = now;
    }

    if (s.tokensRemaining >= 1) {
      s.tokensRemaining -= 1;
      s.requestCount += 1;
      return { allowed: true, retryAfterMs: 0, state: { ...s } };
    }

    // Rate limited: compute time until next token
    const deficit = 1 - s.tokensRemaining;
    const retryAfterMs = Math.ceil(deficit / refillRate);
    s.nextRefillAt = now + retryAfterMs;
    return { allowed: false, retryAfterMs, state: { ...s } };
  }

  /** Reset state for a provider. */
  reset(providerId: string): void {
    this.state.delete(providerId);
  }

  /** Get current state. */
  getState(providerId: string): RateLimitState | null {
    const s = this.state.get(providerId);
    return s ? { ...s } : null;
  }

  /** Get all current states. */
  getAllStates(): RateLimitState[] {
    return Array.from(this.state.values()).map((s) => ({ ...s }));
  }

  /** Clear all state. */
  clear(): void {
    this.state.clear();
  }

  /** Update config. */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
