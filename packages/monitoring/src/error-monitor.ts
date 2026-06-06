// ==============================================================================
// Phase 32: Error Monitor — Facade
// ==============================================================================

import { EventEmitter } from 'node:events';
import { SentryClient } from './sentry-client.js';
import { ErrorGrouper } from './error-grouper.js';
import { Tracer } from './performance-tracer.js';
import { AlertEngine } from './alert-rules.js';
import type {
  MonitoringConfig,
  MonitoringContext,
  MonitoringStats,
  Severity,
  AlertEvent,
  ErrorGroup,
  CapturedError,
  AlertRule,
  PerformanceTransaction,
} from './types.js';

export interface ErrorMonitorEvents {
  error: (event: CapturedError) => void;
  alert: (alert: AlertEvent) => void;
  transaction: (tx: PerformanceTransaction) => void;
}

/**
 * ErrorMonitor — facade chính cho Phase 32.
 *
 * Tổng hợp:
 *  - SentryClient (transport)
 *  - ErrorGrouper (dedup)
 *  - Tracer (performance)
 *  - AlertEngine (rules)
 *
 * Sử dụng:
 *   const monitor = new ErrorMonitor({ enabled: true, sentry: { dsn, environment } });
 *   await monitor.init();
 *
 *   monitor.captureException(error, { userId: 'u1' });
 *   const tx = monitor.startTransaction('chat', 'ai.chat');
 *   await monitor.finish(tx);
 *
 *   monitor.on('alert', (a) => console.warn('Alert fired:', a));
 */
export class ErrorMonitor extends EventEmitter {
  private readonly config: MonitoringConfig;
  private readonly sentry: SentryClient | undefined;
  private readonly grouper: ErrorGrouper;
  private readonly tracer: Tracer;
  private readonly alerter: AlertEngine;
  private totalTransactions = 0;

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
    this.grouper = new ErrorGrouper({ maxGroups: config.maxErrorGroups ?? 500 });
    this.sentry = config.sentry ? new SentryClient(config.sentry) : undefined;
    this.tracer = new Tracer({ sentryClient: this.sentry });
    this.alerter = new AlertEngine({ logger: config.logger });

    if (config.alertRules) {
      for (const rule of config.alertRules) this.alerter.addRule(rule);
    }
  }

  /**
   * Khởi tạo Sentry transport.
   */
  async init(): Promise<void> {
    if (!this.config.enabled) return;
    if (this.sentry) await this.sentry.init();
  }

  /**
   * Capture exception.
   */
  async captureException(error: Error | string, context?: MonitoringContext, severity: Severity = 'error'): Promise<CapturedError> {
    if (!this.config.enabled) {
      return {
        id: 'noop',
        type: 'Error',
        message: typeof error === 'string' ? error : error.message,
        severity,
        timestamp: Date.now(),
        context: context ?? {},
        fingerprint: 'noop',
      };
    }

    // Send to Sentry
    if (this.sentry) {
      if (severity === 'fatal') {
        await this.sentry.captureException(error, context);
      } else {
        await this.sentry.captureException(error, context);
      }
    }

    // Build local event
    const err = typeof error === 'string' ? new Error(error) : error;
    const event: CapturedError = {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: err.name || 'Error',
      message: err.message,
      stack: err.stack,
      severity,
      timestamp: Date.now(),
      context: context ?? {},
      fingerprint: this.computeFingerprint(err),
    };

    // Ingest into grouper
    this.grouper.ingest(event);
    this.emit('error', event);

    // Evaluate alert rules
    const alerts = await this.alerter.evaluate(event);
    for (const alert of alerts) this.emit('alert', alert);

    return event;
  }

  /**
   * Capture message (non-fatal).
   */
  async captureMessage(message: string, severity: 'info' | 'warning' = 'info', context?: MonitoringContext): Promise<void> {
    await this.captureException(new Error(message), context, severity);
  }

  /**
   * Bắt đầu transaction.
   */
  startTransaction(name: string, op?: string, tags?: Record<string, string>): PerformanceTransaction | undefined {
    if (!this.config.enabled) return undefined;
    const tx = this.tracer.start(name, op, tags);
    if (tx) {
      this.totalTransactions++;
      this.emit('transaction', tx);
    }
    return tx;
  }

  /**
   * Kết thúc transaction.
   */
  async finishTransaction(tx: PerformanceTransaction, status: 'ok' | 'internal_error' = 'ok'): Promise<void> {
    await this.tracer.finish(tx, status);
  }

  /**
   * Helper: chạy async operation trong transaction.
   */
  async withTransaction<T>(
    name: string,
    op: string,
    tags: Record<string, string> | undefined,
    fn: (tx: PerformanceTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.config.enabled) return fn({} as PerformanceTransaction);
    const tx = this.tracer.start(name, op, tags);
    if (!tx) return fn({} as PerformanceTransaction);
    try {
      const result = await fn(tx);
      await this.tracer.finish(tx, 'ok');
      return result;
    } catch (err) {
      await this.tracer.finish(tx, 'internal_error');
      throw err;
    }
  }

  /**
   * Thêm alert rule.
   */
  addAlertRule(rule: AlertRule): void {
    this.alerter.addRule(rule);
  }

  /**
   * Lấy top error groups.
   */
  topErrors(n = 10): ErrorGroup[] {
    return this.grouper.top(n);
  }

  /**
   * Lấy tổng quan stats.
   */
  stats(): MonitoringStats {
    const grouperStats = this.grouper.stats();
    const tracerStats = this.tracer.stats();
    const alerterStats = this.alerter.stats();
    return {
      totalErrors: grouperStats.totalErrors,
      totalTransactions: tracerStats.totalTransactions,
      totalSpans: tracerStats.totalSpans,
      errorGroupCount: grouperStats.groupCount,
      activeAlertRules: alerterStats.activeRules,
      alertsTriggered: alerterStats.alertsTriggered,
      currentSampleRate: tracerStats.sampleRate,
    };
  }

  /**
   * Đóng monitor, flush queue.
   */
  async shutdown(): Promise<void> {
    if (this.sentry) await this.sentry.close();
    this.removeAllListeners();
  }

  /**
   * Expose internal sub-modules cho test/advanced use.
   */
  getSentry(): SentryClient | undefined {
    return this.sentry;
  }
  getGrouper(): ErrorGrouper {
    return this.grouper;
  }
  getTracer(): Tracer {
    return this.tracer;
  }
  getAlerter(): AlertEngine {
    return this.alerter;
  }

  private computeFingerprint(error: Error): string {
    const topFrames = (error.stack ?? '').split('\n').slice(0, 3).join('|');
    let hash = 2166136261;
    const input = `${error.name}:${error.message}:${topFrames}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}
