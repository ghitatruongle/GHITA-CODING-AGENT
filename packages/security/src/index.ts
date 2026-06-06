// ==============================================================================
// Phase 34: Security Audit — Public API
// ==============================================================================

export { InputSanitizer } from './input-sanitizer.js';
export { CorsAuditor } from './cors-auditor.js';
export { SecretRotator, maskKey } from './secret-rotator.js';
export type { SecretRotatorOptions } from './secret-rotator.js';
export { AuditRunner } from './audit-runner.js';
export type { AuditRunOptions } from './audit-runner.js';

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

export const SECURITY_VERSION = '0.0.3';
