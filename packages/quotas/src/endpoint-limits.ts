// Pre-configured endpoint rate limits for common GHITA API routes.
// Use with RateLimiter.registerLimit() to quickly set up per-endpoint limits.

export interface EndpointRule {
  /** Unique limit identifier (used as `limitId` in RateLimiter.check) */
  id: string;
  /** Display name for the endpoint */
  name: string;
  /** Route pattern this limit applies to (for documentation/reference) */
  route: string;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window */
  window: 'second' | 'minute' | 'hour' | 'day';
  /** Scope of the limit */
  scope: 'requests' | 'tokens';
  /** Optional group for reporting */
  group?: string;
}

/**
 * Default endpoint rate limits.
 * 
 * Usage:
 * ```ts
 * import { RateLimiter, DEFAULT_ENDPOINT_LIMITS } from '@ghita/quotas';
 * const limiter = new RateLimiter();
 * for (const rule of DEFAULT_ENDPOINT_LIMITS) {
 *   limiter.registerLimit(rule);
 * }
 * // Then check:
 * const result = limiter.check(userId, 'api.chat');
 * ```
 */
export const DEFAULT_ENDPOINT_LIMITS: EndpointRule[] = [
  // Chat & AI
  { id: 'api.chat',         name: 'Chat Completions', route: '/api/chat',           limit: 60,   window: 'minute', scope: 'requests', group: 'ai' },
  { id: 'api.chat.tokens',  name: 'Chat Tokens',      route: '/api/chat',           limit: 100000, window: 'minute', scope: 'tokens',   group: 'ai' },
  { id: 'api.stream',       name: 'Streaming Chat',   route: '/api/stream',         limit: 30,   window: 'minute', scope: 'requests', group: 'ai' },

  // Authentication
  { id: 'api.auth.login',   name: 'Login',            route: '/api/auth/login',     limit: 10,   window: 'minute', scope: 'requests', group: 'auth' },
  { id: 'api.auth.register',name: 'Register',         route: '/api/auth/register',  limit: 3,    window: 'minute', scope: 'requests', group: 'auth' },

  // Pairing
  { id: 'api.pairing',      name: 'Pairing Code',     route: '/api/pairing',        limit: 5,    window: 'minute', scope: 'requests', group: 'pairing' },

  // File operations
  { id: 'api.files.read',   name: 'File Read',        route: '/api/files/*',        limit: 120,  window: 'minute', scope: 'requests', group: 'files' },
  { id: 'api.files.write',  name: 'File Write',       route: '/api/files/write',    limit: 30,   window: 'minute', scope: 'requests', group: 'files' },

  // Skills
  { id: 'api.skills.run',   name: 'Skill Execution',  route: '/api/skills/run',     limit: 60,   window: 'minute', scope: 'requests', group: 'skills' },

  // Agent operations
  { id: 'api.agents.run',   name: 'Agent Run',        route: '/api/agents/run',     limit: 20,   window: 'minute', scope: 'requests', group: 'agents' },

  // Marketplace
  { id: 'api.marketplace',  name: 'Marketplace',      route: '/api/marketplace',    limit: 30,   window: 'minute', scope: 'requests', group: 'marketplace' },
];

/**
 * Get rate limit rules for a specific group.
 */
export function getLimitsByGroup(group: string): EndpointRule[] {
  return DEFAULT_ENDPOINT_LIMITS.filter((rule) => rule.group === group);
}

/**
 * Find a rate limit rule by route prefix.
 */
export function findLimitByRoute(route: string): EndpointRule | undefined {
  return DEFAULT_ENDPOINT_LIMITS.find((rule) => {
    // Convert route pattern to regex (replace * with .*)
    const pattern = `^${rule.route.replace(/\*/g, '.*')}$`;
    return new RegExp(pattern).test(route);
  });
}
