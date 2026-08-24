export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

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

 */
export interface SentryConfig {
  /** Sentry DSN (https://...@sentry.io/123) */
  dsn: string;
  
  environment: string;
  /** Release version (vd: 'ghita@0.0.3') */
  release?: string;
  /** Sample rate cho errors (0-1) */
  sampleRate?: number;
  /** Sample rate cho performance traces (0-1) */
  tracesSampleRate?: number;
  
  debug?: boolean;
  /** Server name (vd: hostname) */
  serverName?: string;
}

/**
 * Performance span.

 */
export interface PerformanceSpan {
  /** Span ID */
  spanId: string;
  
  traceId: string;
  /** Operation name (vd: 'http.client', 'db.query', 'ai.chat') */
  op: string;
  
  description?: string;
  
  startTimestamp: number;
  
  endTimestamp?: number;
  
  parentSpanId?: string;
  /** Tags */
  tags?: Record<string, string>;
  
  status?: 'ok' | 'internal_error' | 'unavailable' | 'deadline_exceeded';
}

export interface PerformanceTransaction extends PerformanceSpan {
  
  spans: PerformanceSpan[];
  /** Transaction name (vd: 'POST /api/chat') */
  name: string;
  
  finished: boolean;
}

export interface AlertRule {
  /** Rule ID (unique) */
  id: string;
  
  name: string;
  
  pattern: string;
  
  minSeverity: Severity;
  
  threshold: number;
  
  windowMs: number;
  
  cooldownMs: number;
  /** Callback khi trigger */
  onTrigger?: (event: AlertEvent) => void | Promise<void>;
  
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
  
  severity: Severity;
  
  count: number;
  
  sampleMessage: string;
  
  timestamp: number;
}

export interface ErrorGroup {
  
  fingerprint: string;
  /** Error type/class name */
  type: string;
  /** Sample message */
  message: string;
  
  count: number;
  
  firstSeen: number;
  
  lastSeen: number;
  
  affectedUsers: Set<string>;
  
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

export interface MonitoringConfig {
  
  sentry?: SentryConfig;
  
  enabled: boolean;
  
  maxErrorGroups?: number;
  
  alertRules?: AlertRule[];
  /** Logger callback (vd: console) */
  logger?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}

export interface MonitoringStats {
  
  totalErrors: number;
  
  totalTransactions: number;
  
  totalSpans: number;
  
  errorGroupCount: number;
  
  activeAlertRules: number;
  
  alertsTriggered: number;
  
  currentSampleRate: number;
}
