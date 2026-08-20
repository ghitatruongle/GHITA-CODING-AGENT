// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 2.5: Smart Per-turn Router
// ------------------------------------------------------------------------------
// Heuristic classifier that routes each turn to an appropriate model tier
// based on complexity (pattern: openclaude smart-routing). Simple turns go
// to cheaper/faster models; complex turns go to stronger ones. The classifier
// runs synchronously before the LLM call so there is zero latency overhead.
//
// This is complementary to the existing bandit router (which selects among
// providers within a role); the smart router classifies the REQUEST first,
// then the bandit picks the best provider within that tier.
// ==============================================================================

/** Model tier classification for a single turn. */
export type TurnComplexity = 'simple' | 'moderate' | 'complex';

/** Configuration for the smart router heuristic. */
export interface SmartRouterConfig {
  /** Character threshold below which a turn is considered simple (default: 200). */
  simpleThreshold?: number;
  /** Character threshold above which a turn is considered complex (default: 2000). */
  complexThreshold?: number;
  /** Keywords that force complex classification regardless of length. */
  complexKeywords?: RegExp;
  /** Keywords that force simple classification regardless of length. */
  simpleKeywords?: RegExp;
}

const DEFAULT_COMPLEX_KEYWORDS =
  /\b(architect|design|refactor|debug|analyze|compare|explain|plan|strategy|security|vulnerability|migrate|optimize|performance)\b/i;
const DEFAULT_SIMPLE_KEYWORDS = /\b(hello|hi|thanks|ok|yes|no|bye|good|great|sure)\b/i;

/**
 * Classify a user message into a complexity tier. Pure function, no side
 * effects, no network calls. Designed to run in <1ms.
 */
export function classifyTurnComplexity(
  userMessage: string,
  config?: SmartRouterConfig,
): TurnComplexity {
  const simpleThreshold = config?.simpleThreshold ?? 200;
  const complexThreshold = config?.complexThreshold ?? 2000;
  const complexKw = config?.complexKeywords ?? DEFAULT_COMPLEX_KEYWORDS;
  const simpleKw = config?.simpleKeywords ?? DEFAULT_SIMPLE_KEYWORDS;

  const trimmed = userMessage.trim();
  const len = trimmed.length;

  // Keyword overrides take priority
  if (complexKw.test(trimmed)) return 'complex';
  if (simpleKw.test(trimmed) && len < simpleThreshold * 2) return 'simple';

  // Length-based classification
  if (len <= simpleThreshold) return 'simple';
  if (len >= complexThreshold) return 'complex';
  return 'moderate';
}

/**
 * Agent routing map: maps agent names to preferred model tiers. Used by the
 * orchestrator to select which agent handles which type of request.
 */
export interface AgentRoutingEntry {
  /** Agent name or glob pattern (e.g. 'code-reviewer', 'writer-*'). */
  agentPattern: string;
  /** Preferred complexity tier this agent handles best. */
  preferredTier: TurnComplexity;
  /** Priority within the same tier (lower = preferred). */
  priority: number;
}

/**
 * Match an agent name against a routing entry pattern. Supports exact match
 * and trailing wildcard ('*').
 */
export function matchesAgentPattern(agentName: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return agentName.startsWith(pattern.slice(0, -1));
  }
  return agentName === pattern;
}

/**
 * Select the best agent for a given complexity tier from a routing map.
 * Returns the agent pattern with the lowest priority number for the tier,
 * or undefined if no match exists.
 */
export function selectAgentForTier(
  tier: TurnComplexity,
  routingMap: AgentRoutingEntry[],
): string | undefined {
  const candidates = routingMap
    .filter((entry) => entry.preferredTier === tier)
    .sort((a, b) => a.priority - b.priority);
  return candidates[0]?.agentPattern;
}
