// Thin wrapper around Sentry SDK. Now @sentry/node is installed.

import type {
  SentryConfig,
  CapturedError,
  MonitoringContext,
  PerformanceTransaction,
  PerformanceSpan,
} from './types.js';

export interface SentryBreadcrumb {
  category?: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  timestamp?: number;
  data?: Record<string, unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- optional Sentry SDK ships no usable types for this surface */
type SentryModuleType = {
  init(options: Record<string, unknown>): void;
  captureException(exception: unknown, hint?: Record<string, unknown>): string;
  addBreadcrumb(breadcrumb: Record<string, unknown>): void;
  setUser(user: Record<string, unknown> | null): void;
  flush(timeout?: number): Promise<boolean>;
  startSpan<T>(options: Record<string, unknown>, callback: (span: any) => T): T;
  startInactiveSpan(options: Record<string, unknown>): {
    end(endTimestamp?: number): void;
    setAttribute(key: string, value: unknown): void;
  };
  setTag(key: string, value: string): void;
  setContext(name: string, context: Record<string, unknown> | null): void;
};

let SentryModule: SentryModuleType | null = null;

async function getSentry(): Promise<SentryModuleType> {
  if (!SentryModule) {
    SentryModule = (await import('@sentry/node')) as unknown as SentryModuleType;
  }
  return SentryModule;
}

/**

 *

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
  
  private readonly maxQueueSize = 1000;

  constructor(config: SentryConfig) {
    this.config = config;
  }

  getConfig(): SentryConfig {
    return this.config;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const Sentry = await getSentry();
      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment,
        release: this.config.release,
        sampleRate: this.config.sampleRate ?? 1.0,
        tracesSampleRate: this.config.tracesSampleRate ?? 0.1,
        debug: this.config.debug ?? false,
      });
      this.initialized = true;
      // Flush any queued events
      for (const event of this.eventQueue) {
        Sentry.captureException(new Error(event.message), {
          extra: this.contextToExtras(event.context),
          tags: { type: event.type, severity: event.severity },
        });
      }
      this.eventQueue = [];
    } catch (err) {
      
      console.warn('[SentryClient] init failed, using in-memory queue:', err);
      this.initialized = true;
    }
  }

  async captureException(error: Error | string, context?: MonitoringContext): Promise<string> {
    const event = this.toCapturedError(error, 'error', context);
    return this.sendEvent(event);
  }

  /**
   * Capture message (non-fatal log).
   */
  async captureMessage(
    message: string,
    severity: 'info' | 'warning' | 'error' = 'info',
    context?: MonitoringContext,
  ): Promise<string> {
    const event = this.toCapturedError(new Error(message), severity, context);
    return this.sendEvent(event);
  }

  startTransaction(params: {
    name: string;
    op: string;
    traceId?: string;
    tags?: Record<string, string>;
  }): PerformanceTransaction {
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

  getTransaction(traceId: string): PerformanceTransaction | undefined {
    return this.transactions.get(traceId);
  }

  async finishTransaction(traceId: string, status: 'ok' | 'internal_error' = 'ok'): Promise<void> {
    const tx = this.transactions.get(traceId);
    if (!tx || tx.finished) return;
    tx.endTimestamp = Date.now();
    tx.finished = true;
    tx.status = status;
    this.transactions.delete(traceId);

    if (this.initialized) {
      try {
        const Sentry = await getSentry();
        Sentry.startSpan(
          {
            name: tx.name,
            op: tx.op,
            forceTransaction: true,
            attributes: { traceId: tx.traceId },
          },
          (transactionSpan) => {
            transactionSpan.setAttribute('traceId', tx.traceId);
            if (tx.tags) {
              for (const [k, v] of Object.entries(tx.tags)) {
                transactionSpan.setAttribute(k, v);
              }
            }
            for (const span of tx.spans) {
              const childSpan = Sentry.startInactiveSpan({
                name: span.description || span.op,
                op: span.op,
                parentSpan: transactionSpan,
              });
              if (span.endTimestamp) {
                childSpan.end(span.endTimestamp / 1000);
              } else {
                childSpan.end();
              }
            }
          },
        );
      } catch (err) {
        console.warn('[SentryClient] Failed to send transaction:', err);
      }
    } else {
      this.transactionQueue.push(tx);
      if (this.transactionQueue.length > this.maxQueueSize) {
        this.transactionQueue.shift();
      }
    }
  }

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

  finishSpan(span: PerformanceSpan, status: 'ok' | 'internal_error' = 'ok'): void {
    span.endTimestamp = Date.now();
    span.status = status;
  }

  /**
   * Add breadcrumb (debug trail).
   */
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    if (this.initialized) {
      getSentry()
        .then((Sentry) => {
          Sentry.addBreadcrumb(breadcrumb as unknown as Record<string, unknown>);
        })
        .catch(() => {});
    }
  }

  /**
   * Set user context.
   */
  setUser(user: { id: string; email?: string; username?: string } | null): void {
    if (this.initialized) {
      getSentry()
        .then((Sentry) => {
          Sentry.setUser(user);
        })
        .catch(() => {});
    }
  }

  async flush(timeoutMs = 2000): Promise<void> {
    if (this.initialized) {
      const Sentry = await getSentry();
      await Sentry.flush(timeoutMs);
    }
    this.eventQueue = [];
    this.transactionQueue = [];
  }

  async close(): Promise<void> {
    await this.flush();
    this.initialized = false;
  }

  // Private helpers
  
  private contextToExtras(context?: MonitoringContext): Record<string, unknown> {
    if (!context) return {};
    const extras: Record<string, unknown> = {};
    if (context.userId) extras.userId = context.userId;
    if (context.sessionId) extras.sessionId = context.sessionId;
    if (context.provider) extras.provider = context.provider;
    if (context.model) extras.model = context.model;
    if (context.requestId) extras.requestId = context.requestId;
    if (context.tags) extras.tags = context.tags;
    if (context.extra) Object.assign(extras, context.extra);
    return extras;
  }

  private async sendEvent(event: CapturedError): Promise<string> {
    this.eventQueue.push(event);
    if (this.eventQueue.length > this.maxQueueSize) {
      this.eventQueue.shift();
    }

    if (this.initialized) {
      try {
        const Sentry = await getSentry();
        Sentry.captureException(new Error(event.message), {
          extra: this.contextToExtras(event.context),
          tags: { type: event.type, severity: event.severity },
        });
      } catch (err) {
        console.warn('[SentryClient] Failed to send event:', err);
      }
    }

    return event.id;
  }

  private toCapturedError(
    error: Error | string,
    severity: 'error' | 'fatal' | 'info' | 'warning',
    context?: MonitoringContext,
  ): CapturedError {
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

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
