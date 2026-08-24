// v0.4.9 A2: Agent Governance — Policy Engine
//
// Deny-default allow/deny policy evaluation for agent tool-calls, following
// zero-trust principles (nothing runs unless explicitly permitted).

import type { PolicyDecision, PolicyRequest, PolicyResult, PolicyRule } from './types.js';

export interface PolicyEngineOptions {
  
  defaultDecision?: PolicyDecision;
  
  rules?: PolicyRule[];
}

/**

 *

 *

 *   const engine = new PolicyEngine({ rules: DEFAULT_POLICY_RULES });
 *   const result = engine.evaluate({ tool: 'terminal.exec', action: 'execute', resource: 'rm -rf /' });
 *   if (result.decision === 'deny') throw new Error(result.reason);
 */
export class PolicyEngine {
  private readonly rules: PolicyRule[] = [];
  private readonly defaultDecision: PolicyDecision;

  constructor(options: PolicyEngineOptions = {}) {
    this.defaultDecision = options.defaultDecision ?? 'deny';
    if (options.rules) {
      for (const rule of options.rules) this.addRule(rule);
    }
  }

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  removeRule(id: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    return true;
  }

  listRules(): PolicyRule[] {
    return [...this.rules];
  }

  evaluate(request: PolicyRequest): PolicyResult {
    const matches = this.rules.filter((rule) => this.matches(rule, request));
    if (matches.length === 0) {
      return {
        decision: this.defaultDecision,
        matchedRule: null,
        reason:
          this.defaultDecision === 'deny'
            ? 'No matching policy rule — denied by zero-trust default.'
            : 'No matching policy rule — allowed by default.',
        request,
      };
    }

    let winner = matches[0];
    if (!winner) {
      // Unreachable (matches is non-empty here) — satisfies the type checker.
      return {
        decision: this.defaultDecision,
        matchedRule: null,
        reason: 'No matching policy rule.',
        request,
      };
    }
    for (const rule of matches.slice(1)) {
      const wp = winner.priority ?? 0;
      const rp = rule.priority ?? 0;
      if (rp > wp) {
        winner = rule;
      } else if (rp === wp && rule.effect === 'deny' && winner.effect === 'allow') {
        winner = rule;
      }
    }

    return {
      decision: winner.effect,
      matchedRule: winner,
      reason: winner.reason ?? `Matched rule ${winner.id} (${winner.effect}).`,
      request,
    };
  }

  enforce(request: PolicyRequest): void {
    const result = this.evaluate(request);
    if (result.decision === 'deny') {
      throw new PolicyViolationError(result);
    }
  }

  private matches(rule: PolicyRule, request: PolicyRequest): boolean {
    if (rule.tool !== undefined && !globMatch(rule.tool, request.tool)) return false;
    if (rule.action !== undefined && rule.action !== '*' && rule.action !== request.action) {
      return false;
    }
    if (rule.resourcePattern !== undefined) {
      if (request.resource === undefined) return false;
      if (!rule.resourcePattern.test(request.resource)) return false;
    }
    return true;
  }
}

export class PolicyViolationError extends Error {
  public readonly result: PolicyResult;
  constructor(result: PolicyResult) {
    super(`Policy denied ${result.request.tool}:${result.request.action} — ${result.reason}`);
    this.name = 'PolicyViolationError';
    this.result = result;
  }
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}
