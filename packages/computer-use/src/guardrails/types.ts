// =============================================================================
// GHITA CODING AGENT - Phase 13: Shell Command Security Types
// Type definitions for Shell Command Blacklist Security Guardrails
// =============================================================================

/**
 * Mức độ nghiêm trọng của lệnh bị phát hiện
 */
export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Loại mối đe dọa bảo mật
 */
export type ThreatType =
  | 'destructive-command'      // rm -rf, mkfs, dd
  | 'fork-bomb'                // :(){ :|:& };:
  | 'remote-execution'         // curl|sh, wget|sh
  | 'obfuscated-command'       // base64 encoded, hex encoded
  | 'binary-execution'         // chmod +x unknown binary, ./unknown
  | 'privilege-escalation'     // sudo su, chmod 777 /
  | 'network-exfiltration'     // nc -l, reverse shells
  | 'custom-blacklist';        // User-defined in YAML

/**
 * Kết quả kiểm tra bảo mật cho một lệnh terminal
 */
export interface SecurityValidationResult {
  /** Lệnh có an toàn không */
  safe: boolean;
  /** Lệnh gốc */
  command: string;
  /** Danh sách các mối đe dọa phát hiện được */
  threats: ThreatDetection[];
  /** Cần phê duyệt từ kỹ sư không */
  requiresApproval: boolean;
  /** Mã lỗi (ví dụ: GHITA-SEC-001) */
  errorCode?: string;
}

/**
 * Một mối đe dọa được phát hiện
 */
export interface ThreatDetection {
  /** Loại mối đe dọa */
  type: ThreatType;
  /** Mức độ nghiêm trọng */
  severity: ThreatSeverity;
  /** Mô tả chi tiết */
  description: string;
  /** Pattern đã khớp */
  matchedPattern: string;
  /** Vị trí trong lệnh (index) */
  position?: number;
}

/**
 * Entry log bảo mật
 */
export interface SecurityLogEntry {
  /** ID duy nhất */
  id: string;
  /** Lệnh bị chặn/chờ duyệt */
  command: string;
  /** Kết quả kiểm tra */
  result: SecurityValidationResult;
  /** Kỹ sư phê duyệt hay từ chối */
  approved?: boolean;
  /** Timestamp */
  timestamp: Date;
  /** Nguồn: 'local' | 'remote-olt' */
  source: 'local' | 'remote-olt';
}

/**
 * Cấu hình blacklist tùy chỉnh từ .ghita/security-blacklist.yaml
 */
export interface SecurityBlacklistConfig {
  /** Danh sách regex cấm bổ sung */
  customPatterns: CustomPatternEntry[];
  /** Danh sách lệnh được phép bỏ qua (whitelist) */
  whitelist: string[];
  /** Bật/tắt kiểm tra base64 */
  detectBase64: boolean;
  /** Bật/tắt kiểm tra binary execution */
  detectBinaryExecution: boolean;
  /** Yêu cầu phê duyệt cho lệnh medium/high */
  requireApprovalForHigh: boolean;
}

/**
 * Một pattern tùy chỉnh trong YAML
 */
export interface CustomPatternEntry {
  /** Tên mô tả */
  name: string;
  /** Regex pattern */
  pattern: string;
  /** Mức độ nghiêm trọng */
  severity: ThreatSeverity;
  /** Mô tả */
  description: string;
}

/**
 * Callback interface cho approval modal (Tauri GUI / OLT remote)
 */
export interface ApprovalCallback {
  /** Hiển thị modal phê duyệt, trả về true nếu kỹ sư đồng ý */
  requestApproval(command: string, threats: ThreatDetection[]): Promise<boolean>;
}

/**
 * Cấu hình mặc định
 */
export const DEFAULT_SECURITY_CONFIG: SecurityBlacklistConfig = {
  customPatterns: [],
  whitelist: [],
  detectBase64: true,
  detectBinaryExecution: true,
  requireApprovalForHigh: true,
};

/**
 * Prefix cho mã lỗi bảo mật
 */
export const SECURITY_ERROR_PREFIX = 'GHITA-SEC';
