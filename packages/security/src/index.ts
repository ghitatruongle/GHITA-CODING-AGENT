// ==============================================================================
// GHITA CODING AGENT — Security Audit, Governance & Sandbox — Public API (v1.1.5-beta2)
// ==============================================================================

export { InputSanitizer } from './input-sanitizer.js';
export { CorsAuditor } from './cors-auditor.js';
export { SecretRotator, maskKey } from './secret-rotator.js';
export type { SecretRotatorOptions } from './secret-rotator.js';
export { AuditRunner } from './audit-runner.js';
export type { AuditRunOptions } from './audit-runner.js';

// v0.4.9 A1: Local rule-based security scanner (original implementation)
export {
  SecurityScanner,
  InvalidScanTargetError,
  DEFAULT_SCANNER_RULES,
  toSecuritySeverity,
} from './scanner/index.js';
export type {
  ScannerOptions,
  ScanOptions,
  ScanReport,
  FindingSeverityLevel,
  FindingConfidenceLevel,
  FindingLocation,
  ScanFinding,
  ScanFindingsDocument,
  ScanCoverageDocument,
  ScannerRule,
  ScanSummary,
} from './scanner/index.js';

// v0.4.9 A2 & v1.1.5-beta2 Track 2: Agent governance (PolicyEngine + OWASP Agentic Top 10 + ExecPolicy)
export {
  PolicyEngine,
  PolicyViolationError,
  DEFAULT_POLICY_RULES,
  checkOwaspAgentic,
  checkCommand,
  splitCompound,
  tokenize,
  parseSegment,
  DEFAULT_EXEC_RULES,
} from './governance/index.js';
export type {
  PolicyEngineOptions,
  OwaspCheckOptions,
  PolicyEffect,
  PolicyDecision,
  PolicyRequest,
  PolicyRule,
  PolicyResult,
  OwaspAgenticRiskId,
  GovernanceFinding,
  AgentActionContext,
  CommandSegment,
  ExecPolicyEffect,
  ExecPolicyRule,
  ExecPolicyVerdict,
} from './governance/index.js';

// v1.1.5-beta2 Track 2: Sandbox Process Runner
export {
  SandboxRunner,
  type SandboxProfileType,
  type SandboxRunnerOptions,
  type SandboxViolationInfo,
  type SandboxExecutionResult,
} from './sandbox/index.js';

export type {
  SecurityIssue,
  SecuritySeverity,
  SecurityCategory,
  AuditReport,
  CorsConfig,
  SanitizationRule,
  ApiKeyInfo,
  RotationEvent,
} from './types.js';

export const SECURITY_VERSION = '1.1.5-beta2';
