// v0.4.9 A2: Agent Governance — Types
//
// Policy enforcement, zero-trust identity and execution-sandboxing types for
// the GHITA agent runtime, with checks mapped to the OWASP Agentic AI Top 10
// risk catalogue.

export type PolicyEffect = 'allow' | 'deny';

export type PolicyDecision = 'allow' | 'deny';

export interface PolicyRequest {
  
  tool: string;
  
  action: string;
  
  resource?: string;
  
  agentId?: string;
  
  metadata?: Record<string, unknown>;
}

export interface PolicyRule {
  id: string;
  effect: PolicyEffect;
  
  tool?: string;
  
  action?: string;
  
  resourcePattern?: RegExp;
  
  priority?: number;
  
  reason?: string;
}

export interface PolicyResult {
  decision: PolicyDecision;
  
  matchedRule: PolicyRule | null;
  reason: string;
  request: PolicyRequest;
}

export type OwaspAgenticRiskId =
  | 'AAI01-memory-poisoning'
  | 'AAI02-tool-misuse'
  | 'AAI03-privilege-compromise'
  | 'AAI04-resource-overload'
  | 'AAI05-cascading-hallucination'
  | 'AAI06-intent-manipulation'
  | 'AAI07-misaligned-behavior'
  | 'AAI08-repudiation-untraceability'
  | 'AAI09-identity-spoofing'
  | 'AAI10-overwhelming-hitl';

export interface GovernanceFinding {
  riskId: OwaspAgenticRiskId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  
  remediation: string;
}

export interface AgentActionContext {
  agentId?: string;
  
  input?: string;
  
  toolCalls?: PolicyRequest[];
  
  iterationCount?: number;
  
  tokenUsage?: { used: number; limit: number };
  
  auditLogged?: boolean;
  
  pendingApprovals?: number;
  
  memoryTrustScore?: number;
}
