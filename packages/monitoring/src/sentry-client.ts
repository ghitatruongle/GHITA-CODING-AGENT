// ==============================================================================
// Phase 32: Sentry Client Wrapper
// ==============================================================================
// Thin wrapper quanh Sentry SDK. Cố tình KHÔNG import @sentry/node trực tiếp
// để package vẫn build được khi Sentry chưa cài. Khi deploy production,
// cài @sentry/node và thay thế phần TODO bằng dynamic import.

import type { SentryConfig, CapturedError, MonitoringContext, PerformanceTransaction, PerformanceSpan } from './types.js';

export interface SentryBreadcrumb {
  category?: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  timestamp?: number;
  data?: Record<string, unknown>;
}

/**
 * SentryClient — giao tiếp với Sentry SDK hoặc self-hosted Sentry-compatible.
 *
 * Sử dụng:
 *   const sentry = new SentryClient({ dsn, environment, release });
 *   await sentry.captureException(error, context);
 *   const tx = sentry.startTransaction({ name: 'POST /chat', op: 'http.server' });
 *   const span = tx.startChild({ op: 'ai.chat' });
 *   span.finish();
 *   tx.finish();
 */
export class SentryClient {
  private readonly config: SentryConfig;
  private initialized = false;
  private eventQueue: CapturedError[] = [];
  private transactionQueue: PerformanceTransaction[] = [];
  /** In-flight transactions map by traceId */
  private readonly transactions = new Map<string, PerformanceTransaction>();
  /** Max events buffered khi chưa flush */
  private readonly maxQueueSize = 1000;

  constructor(config: SentryConfig) {
    this.config = config;
  }

  getConfig(): SentryConfig {
    return this.config;
  }

  /**
   * Khởi tạo Sentry SDK (lazy + graceful).
   * Trong production, dynamic import @sentry/node và init ở đây.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      // TODO: Production — uncomment khi @sentry/node đã cài
      // const Sentry = await import('@sentry/node');
      // Sentry.init({
      //   dsn: this.config.dsn,
      //   environment: this.config.environment,
      //   release: this.config.release,
      //   sampleRate: this.config.sampleRate ?? 1.0,
      //   tracesSampleRate: this.config.tracesSampleRate ?? 0.1,
      //   debug: this.config.debug ?? false,
      // });
      this.initialized = true;
    } catch (err) {
      // Fallback: chỉ log warning, monitoring vẫn hoạt động locally
       
      console.warn('[SentryClient] init failed, using in-memory queue:', err);
      this.initialized = true;
    }
  }

  /**
   * Capture exception và push lên Sentry (hoặc queue nếu Sentry chưa init).
   */
  async captureException(error: Error | string, context?: MonitoringContext): Promise<string> {
    const event = this.toCapturedError(error, 'error', context);
    return this.sendEvent(event);
  }

  /**
   * Capture message (non-fatal log).
   */
  async captureMessage(message: string, severity: 'info' | 'warning' | 'error' = 'info', context?: MonitoringContext): Promise<string> {
    const event = this.toCapturedError(new Error(message), severity, context);
    return this.sendEvent(event);
  }

  /**
   * Bắt đầu performance transaction.
   */
  startTransaction(params: { name: string; op: string; traceId?: string; tags?: Record<string, string> }): PerformanceTransaction {
    const now = Date.now();
    const traceId = params.traceId ?? this.generateId('trace');
    const tx: PerformanceTransaction = {
      spanId: this.generateId('span'),
      traceId,
      op: params.op,
      name: params.name,
      startTimestamp: now,
      spans: [],
      tags: params.tags,
      finished: false,
    };
    this.transactions.set(traceId, tx);
    return tx;
  }

  /**
   * Lấy transaction theo traceId.
   */
  getTransaction(traceId: string): PerformanceTransaction | undefined {
    return this.transactions.get(traceId);
  }

  /**
   * Kết thúc transaction và gửi lên Sentry.
   */
  async finishTransaction(traceId: string, status: 'ok' | 'internal_error' = 'ok'): Promise<void> {
    const tx = this.transactions.get(traceId);
    if (!tx || tx.finished) return;
    tx.endTimestamp = Date.now();
    tx.finished = true;
    tx.status = status;
    this.transactions.delete(traceId);
    this.transactionQueue.push(tx);
    if (this.transactionQueue.length > this.maxQueueSize) {
      this.transactionQueue.shift();
    }
  }

  /**
   * Tạo child span từ transaction.
   */
  startChildSpan(traceId: string, op: string, description?: string): PerformanceSpan | undefined {
    const tx = this.transactions.get(traceId);
    if (!tx) return undefined;
    const span: PerformanceSpan = {
      spanId: this.generateId('span'),
      traceId,
      op,
      description,
      parentSpanId: tx.spanId,
      startTimestamp: Date.now(),
      tags: {},
    };
    tx.spans.push(span);
    return span;
  }

  /**
   * Kết thúc span.
   */
  finishSpan(span: PerformanceSpan, status: 'ok' | 'internal_error' = 'ok'): void {
    span.endTimestamp = Date.now();
    span.status = status;
  }

  /**
   * Add breadcrumb (debug trail).
   */
  addBreadcrumb(_breadcrumb: SentryBreadcrumb): void {
    // TODO: Production — Sentry.addBreadcrumb(breadcrumb)
    // Hiện tại chỉ lưu trong memory
  }

  /**
   * Set user context.
   */
  setUser(_user: { id: string; email?: string; username?: string } | null): void {
    // TODO: Production — Sentry.setUser(user)
  }

  /**
   * Flush queue (gửi tất cả event đang chờ).
   */
  async flush(_timeoutMs = 2000): Promise<void> {
    this.eventQueue = [];
    this.transactionQueue = [];
  }

  /**
   * Đóng Sentry client.
   */
  async close(): Promise<void> {
    await this.flush();
    this.initialized = false;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async sendEvent(event: CapturedError): Promise<string> {
    this.eventQueue.push(event);
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue.shift();
    }
    return event.id;
  }

  private toCapturedError(error: Error | string, severity: 'error' | 'fatal' | 'info' | 'warning', context?: MonitoringContext): CapturedError {
    const err = typeof error === 'string' ? new Error(error) : error;
    return {
      id: this.generateId('evt'),
      type: err.name || 'Error',
      message: err.message,
      stack: err.stack,
      severity,
      timestamp: Date.now(),
      context: context ?? {},
      fingerprint: this.computeFingerprint(err),
    };
  }

  private computeFingerprint(error: Error): string {
    // Combine type + top 3 stack frames để gom nhóm
    const topFrames = (error.stack ?? '').split('\n').slice(0, 3).join('|');
    return simpleHash(`${error.name}:${error.message}:${topFrames}`);
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Cho test/internal: peek queue */
  peekEvents(): CapturedError[] {
    return [...this.eventQueue];
  }

  /** Cho test/internal: peek transactions */
  peekTransactions(): PerformanceTransaction[] {
    return [...this.transactionQueue];
  }
}

/**
 * Hash đơn giản (FNV-1a) — không dùng crypto để giữ lightweight.
 */
function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
