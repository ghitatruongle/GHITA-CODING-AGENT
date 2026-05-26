export type RateLimitScope = 'user' | 'key' | 'model' | 'team' | 'global';
export interface RateLimitConfig {
    /** Requests per window */
    requestsPerWindow: number;
    /** Window duration in seconds */
    windowSeconds: number;
    /** Token limit per window (optional) */
    tokensPerWindow?: number;
    /** Cooldown duration in seconds when limit is hit */
    cooldownSeconds?: number;
    /** Burst allowance (requests above limit allowed briefly) */
    burstAllowance?: number;
}
export interface RateLimitState {
    requestCount: number;
    tokenCount: number;
    windowStart: number;
    lastRequestAt: number;
    cooldownUntil?: number;
    burstUsed: number;
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    limit: number;
    resetAt: number;
    retryAfter?: number;
    reason?: string;
}
export interface RateLimitTier {
    name: string;
    config: RateLimitConfig;
}
export declare const DEFAULT_RATE_LIMIT_TIERS: Record<string, RateLimitTier>;
export declare class RateLimiter {
    private tiers;
    private counters;
    private defaultTier;
    constructor(options?: {
        tiers?: Record<string, RateLimitTier>;
        defaultTier?: string;
    });
    /** Check rate limit for a request */
    check(options: {
        userId?: string;
        keyId?: string;
        model?: string;
        teamId?: string;
        tier?: string;
        tokenCount?: number;
    }): RateLimitResult;
    /** Record token usage after a successful request */
    recordUsage(options: {
        userId?: string;
        keyId?: string;
        model?: string;
        tokenCount: number;
    }): void;
    /** Reset rate limit for a specific identifier */
    reset(scope: RateLimitScope, identifier: string): void;
    /** Add or update a tier */
    setTier(name: string, config: RateLimitConfig): void;
    /** Get tier config */
    getTier(name: string): RateLimitTier | undefined;
    /** Get all tiers */
    getAllTiers(): RateLimitTier[];
    /** Get current state for debugging */
    getDebugState(): Record<string, Record<string, RateLimitState>>;
}
//# sourceMappingURL=rate-limit.d.ts.map