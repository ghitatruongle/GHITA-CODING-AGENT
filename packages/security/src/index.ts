// ==============================================================================
// Phase 34: Security Audit — Public API
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

// v0.4.9 A2: Agent governance (PolicyEngine + OWASP Agentic Top 10)
export {
  PolicyEngine,
  PolicyViolationError,
  DEFAULT_POLICY_RULES,
  checkOwaspAgentic,
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
} from './governance/index.js';

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

export const SECURITY_VERSION = '0.4.9';
