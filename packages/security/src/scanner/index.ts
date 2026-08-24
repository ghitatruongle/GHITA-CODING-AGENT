// v0.4.9 A1: Security Scanner — Public API

export { SecurityScanner, InvalidScanTargetError, redactSpanned } from './engine.js';
export type { ScannerOptions, ScanOptions, ScanReport } from './engine.js';
export { DEFAULT_SCANNER_RULES } from './rules.js';
export { toSecuritySeverity } from './models.js';
export type {
  FindingSeverityLevel,
  FindingConfidenceLevel,
  FindingLocation,
  ScanFinding,
  ScanFindingsDocument,
  ScanCoverageDocument,
  ScannerRule,
  ScanSummary,
} from './models.js';
