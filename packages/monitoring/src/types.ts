// ==============================================================================
// Phase 32: Error Monitoring (Sentry) — Type Definitions
// ==============================================================================

/**
 * Mức độ nghiêm trọng của sự kiện.
 * Map trực tiếp sang Sentry severity levels.
 */
export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

/**
 * Context bổ sung đính kèm với mỗi sự kiện.
 */
export interface MonitoringContext {
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Provider type (openai, anthropic, ...) */
  provider?: string;
  /** Model name */
  model?: string;
  /** Request ID / trace ID */
  requestId?: string;
  /** Tags (key-value) */
  tags?: Record<string, string>;
  /** Extra structured data */
  extra?: Record<string, unknown>;
}

/**
 * Sentry transport config.
 * Khi dùng self-hosted Sentry-compatible, set `dsn` tới relay URL.
 */
export interface SentryConfig {
  /** Sentry DSN (https://...@sentry.io/123) */
  dsn: string;
  /** Môi trường (production, staging, development) */
  environment: string;
  /** Release version (vd: 'ghita@0.0.3') */
  release?: string;
  /** Sample rate cho errors (0-1) */
  sampleRate?: number;
  /** Sample rate cho performance traces (0-1) */
  tracesSampleRate?: number;
  /** Bật chế độ debug */
  debug?: boolean;
  /** Server name (vd: hostname) */
  serverName?: string;
}

/**
 * Performance span.
 * Dùng để đo thời gian thực thi cho 1 operation.
 */
export interface PerformanceSpan {
  /** Span ID */
  spanId: string;
  /** Trace ID (chia sẻ giữa các span trong cùng request) */
  traceId: string;
  /** Operation name (vd: 'http.client', 'db.query', 'ai.chat') */
  op: string;
  /** Mô tả span */
  description?: string;
  /** Thời điểm bắt đầu (epoch ms) */
  startTimestamp: number;
  /** Thời điểm kết thúc (epoch ms) — set khi span.finish() */
  endTimestamp?: number;
  /** Span cha (nếu có) */
  parentSpanId?: string;
  /** Tags */
  tags?: Record<string, string>;
  /** Status code kết quả */
  status?: 'ok' | 'internal_error' | 'unavailable' | 'deadline_exceeded';
}

/**
 * Performance transaction = nhóm các span cùng trace.
 */
export interface PerformanceTransaction extends PerformanceSpan {
  /** Danh sách child span */
  spans: PerformanceSpan[];
  /** Transaction name (vd: 'POST /api/chat') */
  name: string;
  /** Kết thúc chưa? */
  finished: boolean;
}

/**
 * Alert rule — kích hoạt khi error count vượt ngưỡng.
 */
export interface AlertRule {
  /** Rule ID (unique) */
  id: string;
  /** Tên hiển thị */
  name: string;
  /** Pattern regex match error message hoặc error group fingerprint */
  pattern: string;
  /** Severity tối thiểu để trigger */
  minSeverity: Severity;
  /** Ngưỡng số lần xảy ra trong windowMs */
  threshold: number;
  /** Cửa sổ thời gian (ms) */
  windowMs: number;
  /** Cooldown sau khi alert đã fire (ms) */
  cooldownMs: number;
  /** Callback khi trigger */
  onTrigger?: (event: AlertEvent) => void | Promise<void>;
  /** Bật/tắt rule */
  enabled: boolean;
}

/**
 * Event khi alert rule trigger.
 */
export interface AlertEvent {
  /** Rule ID */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Severity cao nhất trong window */
  severity: Severity;
  /** Số lần xảy ra */
  count: number;
  /** Sample error message (lần đầu tiên trong window) */
  sampleMessage: string;
  /** Thời điểm trigger */
  timestamp: number;
}

/**
 * Error group — gom nhóm các error giống nhau bằng fingerprint.
 */
export interface ErrorGroup {
  /** Fingerprint (hash của error signature) */
  fingerprint: string;
  /** Error type/class name */
  type: string;
  /** Sample message */
  message: string;
  /** Tổng số lần xảy ra */
  count: number;
  /** Lần đầu xuất hiện */
  firstSeen: number;
  /** Lần cuối xuất hiện */
  lastSeen: number;
  /** User IDs bị ảnh hưởng */
  affectedUsers: Set<string>;
  /** Lịch sử các event (giới hạn 100) */
  events: CapturedError[];
}

/**
 * Captured error event.
 */
export interface CapturedError {
  /** Event ID (unique) */
  id: string;
  /** Error type/class */
  type: string;
  /** Error message */
  message: string;
  /** Stack trace */
  stack?: string;
  /** Severity */
  severity: Severity;
  /** Timestamp */
  timestamp: number;
  /** Context */
  context: MonitoringContext;
  /** Fingerprint */
  fingerprint: string;
}

/**
 * Monitoring config tổng.
 */
export interface MonitoringConfig {
  /** Sentry config (nếu có) */
  sentry?: SentryConfig;
  /** Có bật monitoring không */
  enabled: boolean;
  /** Số error group tối đa giữ trong memory */
  maxErrorGroups?: number;
  /** Alert rules mặc định */
  alertRules?: AlertRule[];
  /** Logger callback (vd: console) */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}

/**
 * Stats tổng quan.
 */
export interface MonitoringStats {
  /** Tổng error đã capture */
  totalErrors: number;
  /** Tổng transactions đã tạo */
  totalTransactions: number;
  /** Tổng spans đã tạo */
  totalSpans: number;
  /** Số error group hiện tại */
  errorGroupCount: number;
  /** Số alert rule active */
  activeAlertRules: number;
  /** Số alert đã fire */
  alertsTriggered: number;
  /** Sampling rate đang áp dụng */
  currentSampleRate: number;
}
