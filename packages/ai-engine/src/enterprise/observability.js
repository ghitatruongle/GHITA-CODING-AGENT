// ==============================================================================
// GHITA CODING AGENT - Phase 3.10: Observability
// Langfuse, Datadog, Prometheus, OpenTelemetry integrations
// Reference: LiteLLM integrations/
// ==============================================================================
import { randomBytes } from 'node:crypto';
// --- Observability Manager ---
export class ObservabilityManager {
    config;
    traces = new Map();
    spans = new Map();
    metrics = [];
    exporter;
    flushTimer;
    pendingExport = [];
    constructor(config, exporter) {
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
    startTrace(name, options) {
        const traceId = `trace_${randomBytes(12).toString('hex')}`;
        const trace = {
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
    endTrace(traceId) {
        const trace = this.traces.get(traceId);
        if (!trace)
            return;
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
    startSpan(traceId, name, options) {
        const trace = this.traces.get(traceId);
        if (!trace)
            throw new Error(`Trace not found: ${traceId}`);
        const spanId = `span_${randomBytes(8).toString('hex')}`;
        const span = {
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
    endSpan(spanId, status, error) {
        const span = this.spans.get(spanId);
        if (!span)
            return;
        span.endTime = Date.now();
        span.durationMs = span.endTime - span.startTime;
        span.status = status ?? 'ok';
        if (error) {
            span.attributes.error = error;
        }
    }
    /** Add an event to a span */
    addSpanEvent(spanId, name, attributes) {
        const span = this.spans.get(spanId);
        if (!span)
            return;
        span.events.push({
            name,
            timestamp: Date.now(),
            attributes,
        });
    }
    /** Set attributes on a span */
    setSpanAttributes(spanId, attributes) {
        const span = this.spans.get(spanId);
        if (!span)
            return;
        Object.assign(span.attributes, attributes);
    }
    // --- LLM Metrics ---
    /** Record LLM call metrics */
    recordLLMCall(metrics) {
        const fullMetrics = {
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
    getMetrics(options) {
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
        const byModel = {};
        const byProvider = {};
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
            if (m.error)
                errors++;
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
    exportTrace(trace) {
        if (!this.exporter || !this.config.enabled)
            return;
        // Sample check
        if (Math.random() > (this.config.sampleRate ?? 1))
            return;
        const exportData = {
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
                    message: span.attributes.error,
                },
            })),
        };
        if (this.pendingExport.length + exportData.traces.length > (this.config.maxBatchSize ?? 100)) {
            this.flush();
        }
        this.pendingExport.push(...exportData.traces);
    }
    /** Flush pending exports */
    async flush() {
        if (!this.exporter || this.pendingExport.length === 0)
            return;
        const batch = this.pendingExport.splice(0);
        try {
            await this.exporter({ traces: batch });
        }
        catch (error) {
            console.error('[Observability] Export failed:', error);
            // Re-queue on failure (limited)
            if (batch.length < 1000) {
                this.pendingExport.unshift(...batch);
            }
        }
    }
    /** Get all traces */
    getTraces(options) {
        let traces = [...this.traces.values()];
        if (options?.userId) {
            traces = traces.filter((t) => t.userId === options.userId);
        }
        traces.sort((a, b) => b.startTime - a.startTime);
        return traces.slice(0, options?.limit ?? 100);
    }
    /** Get a specific trace */
    getTrace(traceId) {
        return this.traces.get(traceId);
    }
    /** Dispose — stop flush timer and flush remaining */
    async dispose() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.flush();
    }
    /** Check if enabled */
    isEnabled() {
        return this.config.enabled ?? true;
    }
    /** Get config (without secrets) */
    getConfig() {
        const { apiKey: _, ...rest } = this.config;
        return rest;
    }
}
//# sourceMappingURL=observability.js.map