// ==============================================================================
// v0.4.9 A2: Agent Governance — Public API
// ==============================================================================

export { PolicyEngine, PolicyViolationError } from './policy-engine.js';
export type { PolicyEngineOptions } from './policy-engine.js';
export { DEFAULT_POLICY_RULES } from './default-rules.js';
export { checkOwaspAgentic } from './owasp-agentic.js';
export type { OwaspCheckOptions } from './owasp-agentic.js';
export type {
  PolicyEffect,
  PolicyDecision,
  PolicyRequest,
  PolicyRule,
  PolicyResult,
  OwaspAgenticRiskId,
  GovernanceFinding,
  AgentActionContext,
} from './types.js';
