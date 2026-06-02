// ==============================================================================
// GHITA CODING AGENT - Phase 3.2: Rate Limiting
// Per-user, per-key, per-model rate limiting with cooldown management
// Reference: LiteLLM router.py
// ==============================================================================

// --- Types ---

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
  retryAfter?: number; // seconds
  reason?: string;
}

export interface RateLimitTier {
  name: string;
  config: RateLimitConfig;
}

// --- Default Tiers ---

export const DEFAULT_RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  free: {
    name: 'free',
    config: {
      requestsPerWindow: 20,
      windowSeconds: 60,
      tokensPerWindow: 50000,
      cooldownSeconds: 30,
    },
  },
  standard: {
    name: 'standard',
    config: {
      requestsPerWindow: 100,
      windowSeconds: 60,
      tokensPerWindow: 500000,
      cooldownSeconds: 15,
      burstAllowance: 10,
    },
  },
  premium: {
    name: 'premium',
    config: {
      requestsPerWindow: 500,
      windowSeconds: 60,
      tokensPerWindow: 2000000,
      cooldownSeconds: 5,
      burstAllowance: 50,
    },
  },
  enterprise: {
    name: 'enterprise',
    config: {
      requestsPerWindow: 2000,
      windowSeconds: 60,
      tokensPerWindow: 10000000,
      cooldownSeconds: 0,
      burstAllowance: 200,
    },
  },
};

// --- Sliding Window Counter ---

class SlidingWindowCounter {
  private states: Map<string, RateLimitState> = new Map();

  check(
    identifier: string,
    config: RateLimitConfig,
    tokenCount?: number
  ): RateLimitResult {
    const now = Date.now();
    let state = this.states.get(identifier);

    if (!state) {
      state = {
        requestCount: 0,
        tokenCount: 0,
        windowStart: now,
        lastRequestAt: now,
        burstUsed: 0,
      };
      this.states.set(identifier, state);
    }

    const windowMs = config.windowSeconds * 1000;

    // Reset window if expired
    if (now - state.windowStart >= windowMs) {
      state.requestCount = 0;
      state.tokenCount = 0;
      state.windowStart = now;
      state.burstUsed = 0;
    }

    // Check cooldown
    if (state.cooldownUntil && now < state.cooldownUntil) {
      const retryAfter = Math.ceil((state.cooldownUntil - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        limit: config.requestsPerWindow,
        resetAt: Math.ceil((state.windowStart + windowMs) / 1000),
        retryAfter,
        reason: `Cooldown active. Retry after ${retryAfter}s`,
      };
    }

    // Check request limit
    const effectiveLimit =
      config.requestsPerWindow + (config.burstAllowance ?? 0);

    if (state.requestCount >= effectiveLimit) {
      // Apply cooldown
      if (config.cooldownSeconds) {
        state.cooldownUntil = now + config.cooldownSeconds * 1000;
      }

      const resetAt = Math.ceil((state.windowStart + windowMs) / 1000);
      return {
        allowed: false,
        remaining: 0,
        limit: config.requestsPerWindow,
        resetAt,
        retryAfter: config.cooldownSeconds,
        reason: `Rate limit exceeded: ${config.requestsPerWindow} requests per ${config.windowSeconds}s`,
      };
    }

    // Check token limit
    if (
      config.tokensPerWindow &&
      tokenCount &&
      state.tokenCount + tokenCount > config.tokensPerWindow
    ) {
      return {
        allowed: false,
        remaining: config.requestsPerWindow - state.requestCount,
        limit: config.requestsPerWindow,
        resetAt: Math.ceil((state.windowStart + windowMs) / 1000),
        reason: `Token limit exceeded: ${config.tokensPerWindow} tokens per window`,
      };
    }

    // Allow request
    state.requestCount++;
    state.lastRequestAt = now;
    if (tokenCount) {
      state.tokenCount += tokenCount;
    }

    // Track burst usage
    if (state.requestCount > config.requestsPerWindow) {
      state.burstUsed = state.requestCount - config.requestsPerWindow;
    }

    return {
      allowed: true,
      remaining: Math.max(0, config.requestsPerWindow - state.requestCount),
      limit: config.requestsPerWindow,
      resetAt: Math.ceil((state.windowStart + windowMs) / 1000),
    };
  }

  reset(identifier: string): void {
    this.states.delete(identifier);
  }

  getState(identifier: string): RateLimitState | undefined {
    return this.states.get(identifier);
  }

  getAllStates(): Map<string, RateLimitState> {
    return new Map(this.states);
  }
}

// --- Rate Limiter ---

export class RateLimiter {
  private tiers: Map<string, RateLimitTier>;
  private counters: Map<RateLimitScope, SlidingWindowCounter>;
  private defaultTier: string;

  constructor(options?: {
    tiers?: Record<string, RateLimitTier>;
    defaultTier?: string;
  }) {
    this.tiers = new Map(
      Object.entries(options?.tiers ?? DEFAULT_RATE_LIMIT_TIERS)
    );
    this.defaultTier = options?.defaultTier ?? 'standard';

    this.counters = new Map([
      ['user', new SlidingWindowCounter()],
      ['key', new SlidingWindowCounter()],
      ['model', new SlidingWindowCounter()],
      ['team', new SlidingWindowCounter()],
      ['global', new SlidingWindowCounter()],
    ]);
  }

  /** Check rate limit for a request */
  check(options: {
    userId?: string;
    keyId?: string;
    model?: string;
    teamId?: string;
    tier?: string;
    tokenCount?: number;
  }): RateLimitResult {
    const tierName = options.tier ?? this.defaultTier;
    const tier = this.tiers.get(tierName);

    if (!tier) {
      return {
        allowed: true,
        remaining: -1,
        limit: -1,
        resetAt: 0,
        reason: `Unknown tier: ${tierName}`,
      };
    }

    const config = tier.config;

    const globalCounter = this.counters.get('global');
    const teamCounter = this.counters.get('team');
    const userCounter = this.counters.get('user');
    const keyCounter = this.counters.get('key');
    const modelCounter = this.counters.get('model');

    // Check global limit first
    if (!globalCounter) {
      return { allowed: false, remaining: 0, limit: 0, resetAt: 0, reason: 'Global rate limiter not initialized' };
    }
    const globalResult = globalCounter.check('global', {
      ...config,
      requestsPerWindow: config.requestsPerWindow * 10,
    });
    if (!globalResult.allowed) return globalResult;

    // Check team limit
    if (options.teamId && teamCounter) {
      const teamResult = teamCounter
        .check(options.teamId, config, options.tokenCount);
      if (!teamResult.allowed) return teamResult;
    }

    // Check user limit
    if (options.userId && userCounter) {
      const userResult = userCounter
        .check(options.userId, config, options.tokenCount);
      if (!userResult.allowed) return userResult;
    }

    // Check key limit
    if (options.keyId && keyCounter) {
      const keyResult = keyCounter
        .check(options.keyId, config, options.tokenCount);
      if (!keyResult.allowed) return keyResult;
    }

    // Check model limit
    if (options.model && modelCounter) {
      const modelConfig = {
        ...config,
        requestsPerWindow: Math.ceil(config.requestsPerWindow / 2),
      };
      const modelResult = modelCounter
        .check(`${options.model}`, modelConfig, options.tokenCount);
      if (!modelResult.allowed) return modelResult;
    }

    // All passed — return the most restrictive remaining
    const userState = options.userId && userCounter
      ? userCounter.getState(options.userId)
      : undefined;

    return {
      allowed: true,
      remaining: userState
        ? Math.max(0, config.requestsPerWindow - userState.requestCount)
        : config.requestsPerWindow,
      limit: config.requestsPerWindow,
      resetAt: Math.ceil(Date.now() / 1000 + config.windowSeconds),
    };
  }

  /** Record token usage after a successful request */
  recordUsage(options: {
    userId?: string;
    keyId?: string;
    model?: string;
    tokenCount: number;
  }): void {
    // Token usage is already recorded in check() when tokenCount is provided
    // This method is for post-hoc recording when tokens weren't known upfront
    if (options.userId) {
      const userCounter = this.counters.get('user');
      if (userCounter) {
        userCounter.check(
          options.userId,
          { requestsPerWindow: 0, windowSeconds: 60 },
          options.tokenCount
        );
      }
    }
  }

  /** Reset rate limit for a specific identifier */
  reset(scope: RateLimitScope, identifier: string): void {
    this.counters.get(scope)?.reset(identifier);
  }

  /** Add or update a tier */
  setTier(name: string, config: RateLimitConfig): void {
    this.tiers.set(name, { name, config });
  }

  /** Get tier config */
  getTier(name: string): RateLimitTier | undefined {
    return this.tiers.get(name);
  }

  /** Get all tiers */
  getAllTiers(): RateLimitTier[] {
    return [...this.tiers.values()];
  }

  /** Get current state for debugging */
  getDebugState(): Record<string, Record<string, RateLimitState>> {
    const result: Record<string, Record<string, RateLimitState>> = {};
    for (const [scope, counter] of this.counters) {
      const states: Record<string, RateLimitState> = {};
      for (const [id, state] of counter.getAllStates()) {
        states[id] = state;
      }
      result[scope] = states;
    }
    return result;
  }
}
