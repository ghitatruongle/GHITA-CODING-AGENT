import type { PerformanceTransaction, PerformanceSpan } from './types.js';
import type { SentryClient } from './sentry-client.js';

export interface TracerOptions {
  /** Sample rate (0-1) cho transaction */
  sampleRate?: number;
  
  sentryClient?: SentryClient;
}

/**

 *

 *   await tracer.withSpan('ai.chat', { model: 'gpt-4o' }, async (span) => {
 *     const response = await provider.chat(messages);
 *     span.setTag('tokens', String(response.usage.totalTokens));
 *     return response;
 *   });
 */
export class Tracer {
  private readonly sampleRate: number;
  private readonly sentryClient?: SentryClient;
  private totalTransactions = 0;
  private totalSpans = 0;
  private activeTransactions = 0;

  constructor(options: TracerOptions = {}) {
    this.sampleRate = options.sampleRate ?? 1.0;
    this.sentryClient = options.sentryClient;
  }

  shouldSample(): boolean {
    return Math.random() < this.sampleRate;
  }

  start(
    name: string,
    op = 'custom',
    tags?: Record<string, string>,
  ): PerformanceTransaction | undefined {
    if (!this.shouldSample()) return undefined;
    if (this.sentryClient) {
      return this.sentryClient.startTransaction({ name, op, tags });
    }
    this.totalTransactions++;
    this.activeTransactions++;
    const tx: PerformanceTransaction = {
      spanId: `span_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      traceId: `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      op,
      name,
      startTimestamp: Date.now(),
      spans: [],
      tags,
      finished: false,
    };
    return tx;
  }

  startSpan(tx: PerformanceTransaction, op: string, description?: string): PerformanceSpan {
    this.totalSpans++;
    if (this.sentryClient) {
      const span = this.sentryClient.startChildSpan(tx.traceId, op, description);
      return (
        span ?? {
          spanId: `span_${Math.random().toString(36).slice(2, 8)}`,
          traceId: tx.traceId,
          op,
          description,
          parentSpanId: tx.spanId,
          startTimestamp: Date.now(),
          tags: {},
        }
      );
    }
    const span: PerformanceSpan = {
      spanId: `span_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      traceId: tx.traceId,
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
    if (this.sentryClient) this.sentryClient.finishSpan(span, status);
  }

  async finish(tx: PerformanceTransaction, status: 'ok' | 'internal_error' = 'ok'): Promise<void> {
    tx.endTimestamp = Date.now();
    tx.finished = true;
    tx.status = status;
    this.activeTransactions = Math.max(0, this.activeTransactions - 1);
    if (this.sentryClient) await this.sentryClient.finishTransaction(tx.traceId, status);
  }

  async withSpan<T>(
    op: string,
    tags: Record<string, string> | undefined,
    fn: (span: PerformanceSpan) => Promise<T>,
    parentTx?: PerformanceTransaction,
  ): Promise<T> {
    if (parentTx) {
      const span = this.startSpan(parentTx, op);
      try {
        const result = await fn(span);
        this.finishSpan(span, 'ok');
        return result;
      } catch (err) {
        this.finishSpan(span, 'internal_error');
        throw err;
      }
    }
    const tx = this.start(op, op, tags);
    if (!tx) return fn({} as PerformanceSpan);
    try {
      const result = await fn({ ...tx, parentSpanId: undefined });
      await this.finish(tx, 'ok');
      return result;
    } catch (err) {
      await this.finish(tx, 'internal_error');
      throw err;
    }
  }

  stats(): {
    totalTransactions: number;
    totalSpans: number;
    activeTransactions: number;
    sampleRate: number;
  } {
    return {
      totalTransactions: this.totalTransactions,
      totalSpans: this.totalSpans,
      activeTransactions: this.activeTransactions,
      sampleRate: this.sampleRate,
    };
  }
}
