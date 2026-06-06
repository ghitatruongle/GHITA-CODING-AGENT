// ==============================================================================
// Phase 34: Security Audit — Type Definitions
// ==============================================================================

/**
 * Mức độ nghiêm trọng của security issue.
 */
export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Category phân loại issue.
 */
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

/**
 * Security issue phát hiện được.
 */
export interface SecurityIssue {
  /** Issue ID (vd: 'SEC-XSS-001') */
  id: string;
  /** Category */
  category: SecurityCategory;
  /** Severity */
  severity: SecuritySeverity;
  /** Mô tả ngắn */
  title: string;
  /** Mô tả chi tiết */
  description: string;
  /** Vị trí phát hiện (file path, URL, config key) */
  location: string;
  /** Code snippet / evidence */
  evidence?: string;
  /** Gợi ý fix */
  remediation: string;
  /** CWE reference (vd: 'CWE-79') */
  cwe?: string;
  /** Timestamp phát hiện */
  detectedAt: number;
}

/**
 * Audit report tổng hợp.
 */
export interface AuditReport {
  /** Report ID */
  id: string;
  /** Thời điểm chạy audit */
  runAt: number;
  /** Danh sách issue */
  issues: SecurityIssue[];
  /** Tổng số issue theo severity */
  counts: Record<SecuritySeverity, number>;
  /** Điểm tổng (0-100, 100 = không có issue) */
  score: number;
  /** Có pass ngưỡng không */
  passed: boolean;
  /** Ngưỡng pass (score tối thiểu) */
  threshold: number;
}

/**
 * CORS config cần audit.
 */
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
  /** Tên */
  name: string;
  /** Pattern để detect (regex) */
  pattern: RegExp;
  /** Severity khi match */
  severity: SecuritySeverity;
  /** Category */
  category: SecurityCategory;
  /** Hàm fix (optional) */
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
  /** Masked key (chỉ hiện prefix + suffix) */
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
  /** Lý do */
  reason?: string;
  /** Callback */
  onComplete?: (event: RotationEvent) => void | Promise<void>;
}
