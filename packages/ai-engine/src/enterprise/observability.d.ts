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
interface ExporterExport {
    traces: Array<{
        name: string;
        traceId: string;
        spanId: string;
        parentSpanId?: string;
        startTime: number;
        endTime?: number;
        attributes: Record<string, unknown>;
        status: {
            code: string;
            message?: string;
        };
    }>;
}
export declare class ObservabilityManager {
    private config;
    private traces;
    private spans;
    private metrics;
    private exporter?;
    private flushTimer?;
    private pendingExport;
    constructor(config: ObservabilityConfig, exporter?: (data: ExporterExport) => Promise<void>);
    /** Start a new trace */
    startTrace(name: string, options?: {
        userId?: string;
        sessionId?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
    }): Trace;
    /** End a trace */
    endTrace(traceId: string): void;
    /** Start a span within a trace */
    startSpan(traceId: string, name: string, options?: {
        parentSpanId?: string;
        attributes?: Record<string, unknown>;
    }): TraceSpan;
    /** End a span */
    endSpan(spanId: string, status?: 'ok' | 'error', error?: string): void;
    /** Add an event to a span */
    addSpanEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void;
    /** Set attributes on a span */
    setSpanAttributes(spanId: string, attributes: Record<string, unknown>): void;
    /** Record LLM call metrics */
    recordLLMCall(metrics: Omit<LLMCallMetrics, 'traceId' | 'spanId'> & {
        traceId?: string;
        spanId?: string;
    }): void;
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
        byModel: Record<string, {
            calls: number;
            tokens: number;
            cost: number;
        }>;
        byProvider: Record<string, {
            calls: number;
            tokens: number;
            cost: number;
        }>;
    };
    /** Export a trace to the configured backend */
    private exportTrace;
    /** Flush pending exports */
    flush(): Promise<void>;
    /** Get all traces */
    getTraces(options?: {
        limit?: number;
        userId?: string;
    }): Trace[];
    /** Get a specific trace */
    getTrace(traceId: string): Trace | undefined;
    /** Dispose — stop flush timer and flush remaining */
    dispose(): Promise<void>;
    /** Check if enabled */
    isEnabled(): boolean;
    /** Get config (without secrets) */
    getConfig(): Omit<ObservabilityConfig, 'apiKey'>;
}
export {};
//# sourceMappingURL=observability.d.ts.map