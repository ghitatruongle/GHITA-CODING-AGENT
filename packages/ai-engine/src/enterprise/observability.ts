// ==============================================================================
// GHITA CODING AGENT - Phase 3.10: Observability
// Langfuse, Datadog, Prometheus, OpenTelemetry integrations
// Reference: LiteLLM integrations/
// ==============================================================================

import { randomBytes } from 'node:crypto';

// --- Types ---

export type ObservabilityProvider = 'langfuse' | 'datadog' | 'prometheus' | 'otel' | 'custom';

export interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, unknown>;
  events: TraceEvent[];
}

export interface TraceEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Trace {
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  spans: TraceSpan[];
  metadata: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  tags?: string[];
}

export interface LLMCallMetrics {
  traceId: string;
  spanId: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  timeToFirstTokenMs?: number;
  tokensPerSecond?: number;
  cost?: number;
  cached?: boolean;
  error?: string;
}

export interface ObservabilityConfig {
  provider: ObservabilityProvider;
  /** API endpoint for the observability backend */
  endpoint?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Service name */
  serviceName?: string;
  /** Environment (dev, staging, prod) */
  environment?: string;
  /** Sample rate (0-1, default: 1 = 100%) */
  sampleRate?: number;
  /** Enable/disable */
  enabled?: boolean;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Flush interval in ms */
  flushIntervalMs?: number;
  /** Max batch size */
  maxBatchSize?: number;
}

// --- OpenTelemetry-compatible Exporter Interface ---

interface ExporterExport {
  traces: Array<{
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    startTime: number;
    endTime?: number;
    attributes: Record<string, unknown>;
    status: { code: string; message?: string };
  }>;
}

// --- Observability Manager ---

export class ObservabilityManager {
  private config: ObservabilityConfig;
  private traces: Map<string, Trace> = new Map();
  private spans: Map<string, TraceSpan> = new Map();
  private metrics: LLMCallMetrics[] = [];
  private exporter?: (data: ExporterExport) => Promise<void>;
  private flushTimer?: ReturnType<typeof setInterval>;
  private pendingExport: ExporterExport['traces'] = [];

  constructor(config: ObservabilityConfig, exporter?: (data: ExporterExport) => Promise<void>) {
    this.config = {
      sampleRate: 1,
      enabled: true,
      serviceName: 'ghita-ai-engine',
      environment: 'development',
      flushIntervalMs: 10000,
      maxBatchSize: 100,
      ...config,
    };
    this.exporter = exporter;

    if (this.config.enabled && this.config.flushIntervalMs) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  // --- Trace Management ---

  /** Start a new trace */
  startTrace(name: string, options?: {
    userId?: string;
    sessionId?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Trace {
    const traceId = `trace_${randomBytes(12).toString('hex')}`;

    const trace: Trace = {
      traceId,
      name,
      startTime: Date.now(),
      spans: [],
      metadata: options?.metadata ?? {},
      userId: options?.userId,
      sessionId: options?.sessionId,
      tags: options?.tags,
    };

    this.traces.set(traceId, trace);
    return trace;
  }

  /** End a trace */
  endTrace(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.endTime = Date.now();

    // End any open spans
    for (const span of trace.spans) {
      if (!span.endTime) {
        span.endTime = trace.endTime;
        span.durationMs = span.endTime - span.startTime;
        span.status = span.status === 'unset' ? 'ok' : span.status;
      }
    }

    // Export if exporter is set
    this.exportTrace(trace);
  }

  /** Start a span within a trace */
  startSpan(traceId: string, name: string, options?: {
    parentSpanId?: string;
    attributes?: Record<string, unknown>;
  }): TraceSpan {
    const trace = this.traces.get(traceId);
    if (!trace) throw new Error(`Trace not found: ${traceId}`);

    const spanId = `span_${randomBytes(8).toString('hex')}`;

    const span: TraceSpan = {
      spanId,
      traceId,
      parentSpanId: options?.parentSpanId,
      name,
      startTime: Date.now(),
      status: 'unset',
      attributes: options?.attributes ?? {},
      events: [],
    };

    trace.spans.push(span);
    this.spans.set(spanId, span);

    return span;
  }

  /** End a span */
  endSpan(spanId: string, status?: 'ok' | 'error', error?: string): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status ?? 'ok';

    if (error) {
      span.attributes.error = error;
    }
  }

  /** Add an event to a span */
  addSpanEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /** Set attributes on a span */
  setSpanAttributes(spanId: string, attributes: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    Object.assign(span.attributes, attributes);
  }

  // --- LLM Metrics ---

  /** Record LLM call metrics */
  recordLLMCall(metrics: Omit<LLMCallMetrics, 'traceId' | 'spanId'> & {
    traceId?: string;
    spanId?: string;
  }): void {
    const fullMetrics: LLMCallMetrics = {
      traceId: metrics.traceId ?? `trace_${randomBytes(8).toString('hex')}`,
      spanId: metrics.spanId ?? `span_${randomBytes(8).toString('hex')}`,
      ...metrics,
    };

    this.metrics.push(fullMetrics);

    // Keep only last 10000 metrics
    if (this.metrics.length > 10000) {
      this.metrics = this.metrics.slice(-10000);
    }
  }

  /** Get aggregated metrics */
  getMetrics(options?: {
    startTime?: Date;
    endTime?: Date;
    model?: string;
    provider?: string;
  }): {
    totalCalls: number;
    totalTokens: number;
    totalCost: number;
    avgLatencyMs: number;
    avgTokensPerSecond: number;
    errorRate: number;
    byModel: Record<string, { calls: number; tokens: number; cost: number }>;
    byProvider: Record<string, { calls: number; tokens: number; cost: number }>;
  } {
    let filtered = [...this.metrics];

    if (options?.startTime) {
      filtered = filtered.filter((m) => m.latencyMs > 0); // placeholder
    }
    if (options?.model) {
      filtered = filtered.filter((m) => m.model === options.model);
    }
    if (options?.provider) {
      filtered = filtered.filter((m) => m.provider === options.provider);
    }

    const byModel: Record<string, { calls: number; tokens: number; cost: number }> = {};
    const byProvider: Record<string, { calls: number; tokens: number; cost: number }> = {};

    let totalTokens = 0;
    let totalCost = 0;
    let totalLatency = 0;
    let totalTPS = 0;
    let errors = 0;
    let tpsCount = 0;

    for (const m of filtered) {
      totalTokens += m.totalTokens;
      totalCost += m.cost ?? 0;
      totalLatency += m.latencyMs;
      if (m.tokensPerSecond) {
        totalTPS += m.tokensPerSecond;
        tpsCount++;
      }
      if (m.error) errors++;

      const modelEntry = byModel[m.model] ??= { calls: 0, tokens: 0, cost: 0 };
      modelEntry.calls++;
      modelEntry.tokens += m.totalTokens;
      modelEntry.cost += m.cost ?? 0;

      const providerEntry = byProvider[m.provider] ??= { calls: 0, tokens: 0, cost: 0 };
      providerEntry.calls++;
      providerEntry.tokens += m.totalTokens;
      providerEntry.cost += m.cost ?? 0;
    }

    return {
      totalCalls: filtered.length,
      totalTokens,
      totalCost,
      avgLatencyMs: filtered.length > 0 ? totalLatency / filtered.length : 0,
      avgTokensPerSecond: tpsCount > 0 ? totalTPS / tpsCount : 0,
      errorRate: filtered.length > 0 ? errors / filtered.length : 0,
      byModel,
      byProvider,
    };
  }

  // --- Export ---

  /** Export a trace to the configured backend */
  private exportTrace(trace: Trace): void {
    if (!this.exporter || !this.config.enabled) return;

    // Sample check
    if (Math.random() > (this.config.sampleRate ?? 1)) return;

    const exportData: ExporterExport = {
      traces: trace.spans.map((span) => ({
        name: span.name,
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        startTime: span.startTime,
        endTime: span.endTime,
        attributes: {
          ...span.attributes,
          'service.name': this.config.serviceName,
          'deployment.environment': this.config.environment,
        },
        status: {
          code: span.status,
          message: span.attributes.error as string,
        },
      })),
    };

    if (this.pendingExport.length + exportData.traces.length > (this.config.maxBatchSize ?? 100)) {
      this.flush();
    }

    this.pendingExport.push(...exportData.traces);
  }

  /** Flush pending exports */
  async flush(): Promise<void> {
    if (!this.exporter || this.pendingExport.length === 0) return;

    const batch = this.pendingExport.splice(0);
    try {
      await this.exporter({ traces: batch });
    } catch (error) {
      console.error('[Observability] Export failed:', error);
      // Re-queue on failure (limited)
      if (batch.length < 1000) {
        this.pendingExport.unshift(...batch);
      }
    }
  }

  /** Get all traces */
  getTraces(options?: { limit?: number; userId?: string }): Trace[] {
    let traces = [...this.traces.values()];
    if (options?.userId) {
      traces = traces.filter((t) => t.userId === options.userId);
    }
    traces.sort((a, b) => b.startTime - a.startTime);
    return traces.slice(0, options?.limit ?? 100);
  }

  /** Get a specific trace */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  /** Dispose — stop flush timer and flush remaining */
  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }

  /** Check if enabled */
  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }

  /** Get config (without secrets) */
  getConfig(): Omit<ObservabilityConfig, 'apiKey'> {
    const { apiKey: _, ...rest } = this.config;
    return rest;
  }
}
