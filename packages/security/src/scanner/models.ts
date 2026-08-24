// v0.4.9 A1: Security Scanner — Document Models
//
// Types describing the findings/coverage documents produced by the local
// rule-based scanner. Document shapes are kept close to the common SARIF-like
// security-scan conventions so results are easy to consume downstream.

import type { SecuritySeverity } from '../types.js';

/** Severity levels for a scanner finding, ordered most→least severe. */
export type FindingSeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/** How confident the rule engine is that a finding is a true positive. */
export type FindingConfidenceLevel = 'high' | 'medium' | 'low';

/** A single location (file + line span) where a finding was detected. */
export interface FindingLocation {
  /** Repo-relative path, always POSIX separators. */
  path: string;
  startLine: number;
  endLine?: number;
  role?: string;
}

/**
 * A single finding emitted by the scanner. The shape is self-contained and
 * SARIF-friendly (severity/confidence/taxonomy/locations + a stable fingerprint
 * for dedup across runs).
 */
export interface ScanFinding {
  findingId: string;
  ruleId: string;
  title: string;
  summary: string;
  severity: {
    level: FindingSeverityLevel;
    rationale?: string;
  };
  confidence: {
    level: FindingConfidenceLevel;
    rationale: string;
  };
  taxonomy: {
    category: string;
    cwe: string[];
  };
  locations: FindingLocation[];
  
  evidence?: string;
  remediation: string;
  fingerprints: {
    algorithm: 'ghita-scanner/v1';
    
    primary: string;
  };
  provenance: {
    source: 'ghita-local-scanner';
  };
}

/** Top-level findings document returned by a scan. */
export interface ScanFindingsDocument {
  documentType: 'ghita-security.findings';
  schemaVersion: '1.0';
  scanId: string;
  findings: ScanFinding[];
}

/** Coverage document: what was scanned and how completely. */
export interface ScanCoverageDocument {
  documentType: 'ghita-security.coverage';
  schemaVersion: '1.0';
  scanId: string;
  mode: 'repository' | 'scoped_path';
  completeness: 'complete' | 'partial';
  includePaths: string[];
  excludePaths: string[];
  
  stats: {
    filesScanned: number;
    filesSkipped: number;
    bytesScanned: number;
  };
}

export interface ScannerRule {
  id: string;
  title: string;
  
  pattern: RegExp;
  severity: FindingSeverityLevel;
  confidence: FindingConfidenceLevel;
  category: string;
  cwe: string[];
  remediation: string;
  
  fileExtensions?: string[];
  
  negativePattern?: RegExp;
}

export function toSecuritySeverity(level: FindingSeverityLevel): SecuritySeverity {
  return level === 'informational' ? 'info' : level;
}

export interface ScanSummary {
  scanId: string;
  startedAt: number;
  completedAt: number;
  root: string;
  counts: Record<FindingSeverityLevel, number>;
  
  score: number;
}
