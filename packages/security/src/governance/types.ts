// ==============================================================================
// v0.4.9 A2: Agent Governance — Types
//
// Policy enforcement, zero-trust identity and execution-sandboxing types for
// the GHITA agent runtime, with checks mapped to the OWASP Agentic AI Top 10
// risk catalogue.
// ==============================================================================

/** Hiệu lực của một policy rule. */
export type PolicyEffect = 'allow' | 'deny';

/** Quyết định cuối cùng của PolicyEngine. */
export type PolicyDecision = 'allow' | 'deny';

/**
 * Yêu cầu đánh giá policy — mô tả một hành động agent sắp thực hiện.
 */
export interface PolicyRequest {
  /** Tên tool/skill (vd: 'terminal.exec', 'browser.act', 'fs.write'). */
  tool: string;
  /** Hành động cụ thể (vd: 'read', 'write', 'delete', 'execute'). */
  action: string;
  /** Tài nguyên đích (path, url, host…). */
  resource?: string;
  /** ID agent gọi (dùng cho zero-trust / audit). */
  agentId?: string;
  /** Metadata bổ sung để rule so khớp. */
  metadata?: Record<string, unknown>;
}

/**
 * Một rule trong policy. Rule khớp khi TẤT CẢ trường được khai báo khớp
 * (trường bỏ trống = wildcard). `deny` luôn thắng `allow` khi cùng độ ưu tiên.
 */
export interface PolicyRule {
  id: string;
  effect: PolicyEffect;
  /** Glob-ish match cho tool (hỗ trợ '*' cuối). Bỏ trống = mọi tool. */
  tool?: string;
  /** Match action. Bỏ trống = mọi action. */
  action?: string;
  /** Regex khớp resource. Bỏ trống = mọi resource. */
  resourcePattern?: RegExp;
  /** Độ ưu tiên (cao hơn thắng). Mặc định 0. */
  priority?: number;
  /** Lý do hiển thị khi rule quyết định. */
  reason?: string;
}

/** Kết quả đánh giá policy. */
export interface PolicyResult {
  decision: PolicyDecision;
  /** Rule đã quyết định (null nếu rơi vào default). */
  matchedRule: PolicyRule | null;
  reason: string;
  request: PolicyRequest;
}

/** OWASP Agentic AI Top 10 — mã định danh rủi ro (2025). */
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

/** Một phát hiện governance ánh xạ vào OWASP Agentic risk. */
export interface GovernanceFinding {
  riskId: OwaspAgenticRiskId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  /** Gợi ý khắc phục. */
  remediation: string;
}

/** Ngữ cảnh một lượt hành động của agent để chấm OWASP checks. */
export interface AgentActionContext {
  agentId?: string;
  /** Nội dung/prompt đầu vào (kiểm tra intent manipulation). */
  input?: string;
  /** Các tool-call dự kiến trong lượt này. */
  toolCalls?: PolicyRequest[];
  /** Số lần lặp / độ sâu đệ quy hiện tại (resource overload). */
  iterationCount?: number;
  /** Ngân sách token đã dùng / giới hạn. */
  tokenUsage?: { used: number; limit: number };
  /** Có ghi audit log cho lượt này không (repudiation). */
  auditLogged?: boolean;
  /** Số approval do người dùng phải xử lý đang chờ (overwhelming HITL). */
  pendingApprovals?: number;
  /** Điểm tin cậy nguồn dữ liệu ký ức (memory poisoning), 0..1. */
  memoryTrustScore?: number;
}
