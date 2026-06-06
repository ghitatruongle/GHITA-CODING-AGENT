// =============================================================================
// GHITA CODING AGENT - Phase 13: Guardrails Module Index
// Export all security guardrail components
// =============================================================================

export { SandboxSecurityFilter, createSecurityFilter } from './sandboxFilter.js';
export { SecurityLogger, createSecurityLogger } from './securityLogger.js';
export {
  findConfigFile,
  parseSecurityYaml,
  loadSecurityConfig,
  generateSampleConfig,
} from './configLoader.js';
export type {
  ThreatSeverity,
  ThreatType,
  SecurityValidationResult,
  ThreatDetection,
  SecurityLogEntry,
  SecurityBlacklistConfig,
  CustomPatternEntry,
  ApprovalCallback,
} from './types.js';
export { DEFAULT_SECURITY_CONFIG, SECURITY_ERROR_PREFIX } from './types.js';
