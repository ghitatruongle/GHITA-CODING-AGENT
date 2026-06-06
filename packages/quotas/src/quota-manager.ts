// ==============================================================================
// Phase 33: Quota Manager
// ==============================================================================

import type { Quota, QuotaCheckResult, OverageEvent } from './types.js';
import { UsageTracker } from './usage-tracker.js';

export interface QuotaManagerOptions {
  /** Logger */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}

/**
 * QuotaManager — quản lý quota & overage cho user.
 *
 * Sử dụng:
 *   const qm = new QuotaManager();
 *   qm.setQuota({ userId: 'u1', plan: 'free', tokenLimit: 100000, window: 'month', resetAt: ..., overage: {...} });
 *   const check = qm.check('u1', 5000); // request 5000 tokens
 *   if (check.allowed) { // do the work; qm.consume('u1', 5000); }
 */
export class QuotaManager {
  private readonly quotas = new Map<string, Quota>();
  private readonly tracker: UsageTracker;
  private readonly onLog?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
  private totalOverageEvents = 0;
  private totalBlocking = 0;

  constructor(tracker?: UsageTracker, options: QuotaManagerOptions = {}) {
    this.tracker = tracker ?? new UsageTracker();
    this.onLog = options.logger;
  }

  /**
   * Set/update quota cho user.
   */
  setQuota(quota: Quota): void {
    this.quotas.set(quota.userId, quota);
  }

  /**
   * Lấy quota của user.
   */
  getQuota(userId: string): Quota | undefined {
    return this.quotas.get(userId);
  }

  /**
   * Xóa quota của user.
   */
  removeQuota(userId: string): boolean {
    return this.quotas.delete(userId);
  }

  /**
   * Check xem user có thể dùng `tokens` nữa không.
   */
  check(userId: string, tokens: number): QuotaCheckResult {
    const quota = this.quotas.get(userId);
    if (!quota) {
      // No quota = unlimited
      return {
        allowed: true,
        quota: {
          userId,
          plan: 'unlimited',
          tokenLimit: Infinity,
          window: 'month',
          resetAt: 0,
          overage: { allowOverage: true, maxOveragePercent: 0, overagePricePer1k: 0, blockAtMax: false },
        },
        tokensUsed: 0,
        tokensRemaining: Infinity,
        inOverage: false,
        overageTokens: 0,
        overageCost: 0,
      };
    }

    // Auto-reset nếu đã quá resetAt
    if (Date.now() >= quota.resetAt) {
      quota.resetAt = this.computeNextReset(quota.window);
    }

    const used = this.tokensUsedInWindow(userId, quota.resetAt);
    const inOverage = used > quota.tokenLimit;
    const overageTokens = Math.max(0, used - quota.tokenLimit);
    const overageCost = (overageTokens / 1000) * quota.overage.overagePricePer1k;

    if (used + tokens <= quota.tokenLimit) {
      return {
        allowed: true,
        quota,
        tokensUsed: used,
        tokensRemaining: quota.tokenLimit - used,
        inOverage: false,
        overageTokens: 0,
        overageCost: 0,
      };
    }

    if (quota.overage.allowOverage) {
      const maxOverage = quota.tokenLimit * (1 + quota.overage.maxOveragePercent / 100);
      if (used + tokens <= maxOverage) {
        return {
          allowed: true,
          quota,
          tokensUsed: used,
          tokensRemaining: 0,
          inOverage: true,
          overageTokens: used + tokens - quota.tokenLimit,
          overageCost: ((used + tokens - quota.tokenLimit) / 1000) * quota.overage.overagePricePer1k,
        };
      }
      if (quota.overage.blockAtMax) {
        this.totalBlocking++;
        return {
          allowed: false,
          quota,
          tokensUsed: used,
          tokensRemaining: 0,
          inOverage: true,
          overageTokens: overageTokens,
          overageCost,
          blockReason: 'overage_cap_reached',
        };
      }
    }

    this.totalBlocking++;
    return {
      allowed: false,
      quota,
      tokensUsed: used,
      tokensRemaining: Math.max(0, quota.tokenLimit - used),
      inOverage: inOverage,
      overageTokens: overageTokens,
      overageCost,
      blockReason: 'quota_exceeded',
    };
  }

  /**
   * Ghi nhận sử dụng token và trigger overage event nếu cần.
   */
  async consume(userId: string, tokens: number, provider = 'unknown', model = 'unknown'): Promise<void> {
    const quota = this.quotas.get(userId);
    if (!quota) return;

    this.tracker.record({ userId, provider, model, promptTokens: tokens, completionTokens: 0 });

    const used = this.tokensUsedInWindow(userId, quota.resetAt);
    if (used > quota.tokenLimit && quota.overage.allowOverage) {
      const overTokens = used - quota.tokenLimit;
      const event: OverageEvent = {
        userId,
        plan: quota.plan,
        tokensUsed: used,
        tokenLimit: quota.tokenLimit,
        overageTokens: overTokens,
        billingAmount: (overTokens / 1000) * quota.overage.overagePricePer1k,
        timestamp: Date.now(),
      };
      this.totalOverageEvents++;
      this.onLog?.(`[Quota] User ${userId} overage: ${overTokens} tokens ($${event.billingAmount.toFixed(4)})`, 'warn');
      if (quota.overage.onOverage) {
        try {
          await quota.overage.onOverage(event);
        } catch (err) {
          this.onLog?.(`[Quota] onOverage callback failed: ${(err as Error).message}`, 'error');
        }
      }
    }
  }

  /**
   * Reset quota cho user (vd: nâng cấp plan).
   */
  reset(userId: string): void {
    const quota = this.quotas.get(userId);
    if (!quota) return;
    quota.resetAt = this.computeNextReset(quota.window);
    this.tracker.forget(userId);
  }

  /**
   * Usage tracker (cho dashboard).
   */
  getTracker(): UsageTracker {
    return this.tracker;
  }

  /**
   * Stats.
   */
  stats(): { quotaCount: number; totalOverageEvents: number; totalBlocking: number } {
    return {
      quotaCount: this.quotas.size,
      totalOverageEvents: this.totalOverageEvents,
      totalBlocking: this.totalBlocking,
    };
  }

  // ============================================================================
  // Private
  // ============================================================================

  private tokensUsedInWindow(userId: string, resetAt: number): number {
    const now = Date.now();
    const windowStart = Math.min(now, resetAt) - this.windowLengthMs(this.quotas.get(userId)?.window ?? 'month');
    const records = this.tracker.query(userId, windowStart, now);
    return records.reduce((sum, r) => sum + r.totalTokens, 0);
  }

  private windowLengthMs(window: Quota['window']): number {
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

  private computeNextReset(window: Quota['window']): number {
    const now = Date.now();
    return now + this.windowLengthMs(window);
  }
}
