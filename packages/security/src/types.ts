export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type SecurityCategory =
  | 'xss'
  | 'sql-injection'
  | 'command-injection'
  | 'path-traversal'
  | 'cors'
  | 'api-key'
  | 'auth'
  | 'csrf'
  | 'open-redirect'
  | 'ssrf'
  | 'secrets'
  | 'input-validation';

export interface SecurityIssue {
  /** Issue ID (vd: 'SEC-XSS-001') */
  id: string;
  /** Category */
  category: SecurityCategory;
  /** Severity */
  severity: SecuritySeverity;
  
  title: string;
  
  description: string;
  
  location: string;
  /** Code snippet / evidence */
  evidence?: string;
  
  remediation: string;
  /** CWE reference (vd: 'CWE-79') */
  cwe?: string;
  
  detectedAt: number;
}

export interface AuditReport {
  /** Report ID */
  id: string;
  
  runAt: number;
  
  issues: SecurityIssue[];
  
  counts: Record<SecuritySeverity, number>;
  
  score: number;
  
  passed: boolean;
  
  threshold: number;
}

export interface CorsConfig {
  /** Allowed origins */
  origins: string[];
  /** Allowed methods */
  methods: string[];
  /** Allowed headers */
  headers: string[];
  /** Exposed headers */
  exposedHeaders?: string[];
  /** Credentials allowed */
  credentials: boolean;
  /** Max age (seconds) */
  maxAge?: number;
}

/**
 * Sanitization rule.
 */
export interface SanitizationRule {
  /** Rule ID */
  id: string;
  
  name: string;
  
  pattern: RegExp;
  /** Severity khi match */
  severity: SecuritySeverity;
  /** Category */
  category: SecurityCategory;
  
  fix?: (input: string) => string;
}

/**
 * API key metadata cho rotation.
 */
export interface ApiKeyInfo {
  /** Key ID */
  id: string;
  /** Provider (vd: 'openai', 'anthropic') */
  provider: string;
  
  maskedKey: string;
  /** Created timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt?: number;
  /** Expiry timestamp (optional) */
  expiresAt?: number;
  /** Status */
  status: 'active' | 'rotating' | 'revoked';
  /** Rotation interval (ms) */
  rotationIntervalMs: number;
}

/**
 * Rotation event.
 */
export interface RotationEvent {
  /** Key ID */
  keyId: string;
  /** Provider */
  provider: string;
  /** Action */
  action: 'rotated' | 'revoked' | 'expired';
  /** Timestamp */
  timestamp: number;
  
  reason?: string;
  /** Callback */
  onComplete?: (event: RotationEvent) => void | Promise<void>;
}
