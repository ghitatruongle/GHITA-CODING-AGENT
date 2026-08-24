/* eslint-disable @typescript-eslint/no-non-null-assertion -- non-null invariants are guaranteed by construction before access */

// Exponential backoff, circuit breaker, and dynamic chain reordering

import type { AIProviderType } from '@ghita/shared';

// Circuit Breaker

/** Circuit breaker state for a single target (provider or model) */
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStatus {
  target: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedUntil: number | null;
}

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit (default: 3) */
  failureThreshold?: number;
  /** Time in ms the circuit stays open before entering half-open (default: 30_000) */
  openDurationMs?: number;
  /** Number of successful half-open probes to close the circuit (default: 1) */
  halfOpenProbes?: number;
  /** Success rate below which the circuit opens (0-1, default: 0 = disabled) */
  failureRateThreshold?: number;
  /** Minimum number of requests before failure rate is considered (default: 5) */
  minimumRequests?: number;
}

const DEFAULT_CB_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 3,
  openDurationMs: 30_000,
  halfOpenProbes: 1,
  failureRateThreshold: 0,
  minimumRequests: 5,
};

// Retry Policy

export interface RetryPolicy {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 500) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 10_000) */
  maxDelayMs?: number;
  /** Add random jitter to delay (default: true) */
  jitter?: boolean;
  /** HTTP status codes that are retryable (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
}

const DEFAULT_RETRY: Required<RetryPolicy> = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  jitter: true,
  retryableStatuses: [429, 500, 502, 503, 504],
};

// Fallback Target

/** A single entry in the fallback chain */
export interface FallbackTarget {
  id: string; // unique identifier (e.g. "openai:gpt-4o")
  provider: AIProviderType;
  model: string;
  /** Optional weight for priority ordering (higher = tried first, default 1) */
  weight?: number;
  /** Optional static cost estimate per 1k tokens (USD) */
  estimatedCostPer1k?: number;
}

// Fallback Execution

/** Result of executing through the fallback chain */
export interface FallbackResult<T> {
  result: T;
  target: FallbackTarget;
  attempts: AttemptRecord[];
  totalDurationMs: number;
}

/** Record of a single attempt against a target */
export interface AttemptRecord {
  target: FallbackTarget;
  success: boolean;
  durationMs: number;
  error?: string;
  retryCount: number;
}

// Configuration

export interface DynamicFallbackConfig {
  /** Ordered fallback chain (first = primary) */
  chain?: FallbackTarget[];
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
  /** Retry policy for individual attempts */
  retry?: RetryPolicy;
  /** Enable dynamic chain reordering based on recent success rates (default: true) */
  dynamicReorder?: boolean;
  /** Window size for success rate tracking (default: 20) */
  successWindow?: number;
  /** Emergency fallback target when all primary targets fail */
  emergencyTarget?: FallbackTarget;
  /** Callback invoked on each failover event */
  onFailover?: (from: FallbackTarget, to: FallbackTarget, error: Error) => void;
  /** Callback invoked when circuit opens */
  onCircuitOpen?: (target: string) => void;
}

// Internal: per-target health tracker

interface TargetHealth {
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  recentResults: boolean[]; // true=success, false=failure (bounded window)
  circuitState: CircuitState;
  circuitOpenedUntil: number;
  halfOpenSuccesses: number;
  lastFailureAt: number;
  lastSuccessAt: number;
}

// DynamicFallbackRouter

export class DynamicFallbackRouter {
  private chain: FallbackTarget[];
  private cbConfig: Required<CircuitBreakerConfig>;
  private retryConfig: Required<RetryPolicy>;
  private dynamicReorder: boolean;
  private successWindow: number;
  private emergencyTarget: FallbackTarget | null;
  private onFailover?: DynamicFallbackConfig['onFailover'];
  private onCircuitOpen?: DynamicFallbackConfig['onCircuitOpen'];

  /** Per-target health tracking */
  private health = new Map<string, TargetHealth>();

  constructor(config: DynamicFallbackConfig = {}) {
    this.chain = config.chain ?? [];
    this.cbConfig = { ...DEFAULT_CB_CONFIG, ...config.circuitBreaker };
    this.retryConfig = { ...DEFAULT_RETRY, ...config.retry };
    this.dynamicReorder = config.dynamicReorder ?? true;
    this.successWindow = config.successWindow ?? 20;
    this.emergencyTarget = config.emergencyTarget ?? null;
    this.onFailover = config.onFailover;
    this.onCircuitOpen = config.onCircuitOpen;
  }

  // Chain Management
  
  /** Set the full fallback chain */
  setChain(chain: FallbackTarget[]): void {
    this.chain = [...chain];
  }

  /** Add a target to the chain */
  addTarget(target: FallbackTarget): void {
    this.chain.push(target);
  }

  /** Remove a target from the chain by id */
  removeTarget(id: string): boolean {
    const idx = this.chain.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.chain.splice(idx, 1);
    return true;
  }

  /** Get the current chain (possibly reordered) */
  getChain(): FallbackTarget[] {
    if (this.dynamicReorder) return this.reorderChain();
    return [...this.chain];
  }

  /** Set the emergency fallback target */
  setEmergencyTarget(target: FallbackTarget): void {
    this.emergencyTarget = target;
  }

  // Execution with Fallback
  
  /**
   * Execute a function through the fallback chain.
   * Tries each target in order, with retries and circuit breaking.
   */
  async execute<T>(fn: (target: FallbackTarget) => Promise<T>): Promise<FallbackResult<T>> {
    const startTime = Date.now();
    const activeChain = this.getChain();
    const attempts: AttemptRecord[] = [];

    for (let i = 0; i < activeChain.length; i++) {
      const target = activeChain[i];
      if (!target) continue;

      // Check circuit breaker
      if (this.isCircuitOpen(target.id)) {
        attempts.push({
          target,
          success: false,
          durationMs: 0,
          error: `Circuit open for ${target.id}`,
          retryCount: 0,
        });
        continue;
      }

      // Try this target with retries
      const attemptResult = await this.executeWithRetry(fn, target);
      attempts.push(...attemptResult.attempts);

      if (attemptResult.success) {
        return {
          result: attemptResult.value!,
          target,
          attempts,
          totalDurationMs: Date.now() - startTime,
        };
      }

      // Notify failover callback
      const nextTarget = activeChain[i + 1];
      if (nextTarget && this.onFailover && attemptResult.lastError) {
        this.onFailover(target, nextTarget, attemptResult.lastError);
      }
    }

    // All primary targets exhausted — try emergency target
    if (this.emergencyTarget) {
      const emergencyResult = await this.executeWithRetry(fn, this.emergencyTarget);
      attempts.push(...emergencyResult.attempts);

      if (emergencyResult.success) {
        return {
          result: emergencyResult.value!,
          target: this.emergencyTarget,
          attempts,
          totalDurationMs: Date.now() - startTime,
        };
      }
    }

    // Total failure
    const lastError =
      attempts.length > 0
        ? (attempts[attempts.length - 1]?.error ?? 'Unknown error')
        : 'No targets in fallback chain';

    throw new Error(
      `[DynamicFallback] All ${attempts.length} attempts across ${activeChain.length} targets failed. Last error: ${lastError}`,
    );
  }

  // Circuit Breaker
  
  /** Check if a target's circuit is currently open */
  isCircuitOpen(targetId: string): boolean {
    const h = this.health.get(targetId);
    if (!h) return false;

    if (h.circuitState === 'open') {
      if (Date.now() >= h.circuitOpenedUntil) {
        // Transition to half-open
        h.circuitState = 'half-open';
        h.halfOpenSuccesses = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  /** Get circuit breaker status for all tracked targets */
  getCircuitStatus(): CircuitBreakerStatus[] {
    const statuses: CircuitBreakerStatus[] = [];
    const now = Date.now();

    for (const [target, h] of this.health) {
      let state: CircuitState = h.circuitState;
      if (state === 'open' && now >= h.circuitOpenedUntil) {
        state = 'half-open';
      }

      statuses.push({
        target,
        state,
        failureCount: h.consecutiveFailures,
        successCount: h.totalSuccesses,
        lastFailureAt: h.lastFailureAt || null,
        lastSuccessAt: h.lastSuccessAt || null,
        openedUntil: h.circuitState === 'open' ? h.circuitOpenedUntil : null,
      });
    }

    return statuses;
  }

  /** Manually reset a target's circuit breaker */
  resetCircuit(targetId: string): void {
    const h = this.health.get(targetId);
    if (h) {
      h.circuitState = 'closed';
      h.consecutiveFailures = 0;
      h.circuitOpenedUntil = 0;
      h.halfOpenSuccesses = 0;
    }
  }

  /** Reset all circuit breakers */
  resetAllCircuits(): void {
    for (const h of this.health.values()) {
      h.circuitState = 'closed';
      h.consecutiveFailures = 0;
      h.circuitOpenedUntil = 0;
      h.halfOpenSuccesses = 0;
    }
  }

  // Health Reporting
  
  /** Report a successful request to a target */
  reportSuccess(targetId: string): void {
    const h = this.getOrCreateHealth(targetId);
    h.totalSuccesses++;
    h.lastSuccessAt = Date.now();
    h.consecutiveFailures = 0;

    // Update recent results window
    h.recentResults.push(true);
    if (h.recentResults.length > this.successWindow) h.recentResults.shift();

    // Half-open → closed transition
    if (h.circuitState === 'half-open') {
      h.halfOpenSuccesses++;
      if (h.halfOpenSuccesses >= this.cbConfig.halfOpenProbes) {
        h.circuitState = 'closed';
      }
    }
  }

  /** Report a failed request to a target */
  reportFailure(targetId: string): void {
    const h = this.getOrCreateHealth(targetId);
    h.totalFailures++;
    h.consecutiveFailures++;
    h.lastFailureAt = Date.now();

    // Update recent results window
    h.recentResults.push(false);
    if (h.recentResults.length > this.successWindow) h.recentResults.shift();

    // Check if circuit should open
    if (h.circuitState === 'closed' && h.consecutiveFailures >= this.cbConfig.failureThreshold) {
      h.circuitState = 'open';
      h.circuitOpenedUntil = Date.now() + this.cbConfig.openDurationMs;
      this.onCircuitOpen?.(targetId);
    }

    // Half-open failure → reopen
    if (h.circuitState === 'half-open') {
      h.circuitState = 'open';
      h.circuitOpenedUntil = Date.now() + this.cbConfig.openDurationMs;
      this.onCircuitOpen?.(targetId);
    }
  }

  /** Get success rate for a target (0-1, returns 1.0 if no data) */
  getSuccessRate(targetId: string): number {
    const h = this.health.get(targetId);
    if (!h || h.recentResults.length === 0) return 1.0;
    const successes = h.recentResults.filter(Boolean).length;
    return successes / h.recentResults.length;
  }

  // Private: retry logic
  
  private async executeWithRetry<T>(
    fn: (target: FallbackTarget) => Promise<T>,
    target: FallbackTarget,
  ): Promise<{ success: boolean; value?: T; attempts: AttemptRecord[]; lastError?: Error }> {
    const attempts: AttemptRecord[] = [];

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      const start = Date.now();
      try {
        const value = await fn(target);
        const durationMs = Date.now() - start;

        this.reportSuccess(target.id);
        attempts.push({ target, success: true, durationMs, retryCount: attempt });

        return { success: true, value, attempts };
      } catch (err: unknown) {
        const durationMs = Date.now() - start;
        const error = err instanceof Error ? err : new Error(String(err));
        const isRetryable = this.isRetryableError(error);

        attempts.push({
          target,
          success: false,
          durationMs,
          error: error.message,
          retryCount: attempt,
        });

        // Don't retry non-retryable errors
        if (!isRetryable || attempt >= this.retryConfig.maxRetries) {
          this.reportFailure(target.id);
          return { success: false, attempts, lastError: error };
        }

        // Exponential backoff with optional jitter
        const delay = this.calculateBackoff(attempt);
        await this.sleep(delay);
      }
    }

    // Should not reach here, but safety net
    this.reportFailure(target.id);
    return { success: false, attempts };
  }

  private isRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    for (const status of this.retryConfig.retryableStatuses) {
      if (msg.includes(String(status))) return true;
    }
    // Also retry on timeout and network errors
    if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound')) {
      return true;
    }
    return false;
  }

  private calculateBackoff(attempt: number): number {
    const expDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const capped = Math.min(expDelay, this.retryConfig.maxDelayMs);
    if (this.retryConfig.jitter) {
      // Full jitter: random between 0 and capped
      return Math.floor(Math.random() * capped);
    }
    return capped;
  }

  // Private: dynamic chain reordering
  
  private reorderChain(): FallbackTarget[] {
    const now = Date.now();
    return [...this.chain].sort((a, b) => {
      const scoreA = this.targetScore(a, now);
      const scoreB = this.targetScore(b, now);
      return scoreB - scoreA; // Higher score first
    });
  }

  /** Compute a composite score for a target (higher = better) */
  private targetScore(target: FallbackTarget, _now: number): number {
    const h = this.health.get(target.id);

    // If circuit is open, push to end
    if (h && h.circuitState === 'open' && Date.now() < h.circuitOpenedUntil) {
      return -1;
    }

    const successRate = this.getSuccessRate(target.id);
    const weight = target.weight ?? 1;

    // Composite: 70% success rate + 30% weight (normalized)
    return successRate * 0.7 + (weight / 10) * 0.3;
  }

  // Helpers
  
  private getOrCreateHealth(targetId: string): TargetHealth {
    let h = this.health.get(targetId);
    if (!h) {
      h = {
        consecutiveFailures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        recentResults: [],
        circuitState: 'closed',
        circuitOpenedUntil: 0,
        halfOpenSuccesses: 0,
        lastFailureAt: 0,
        lastSuccessAt: 0,
      };
      this.health.set(targetId, h);
    }
    return h;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
