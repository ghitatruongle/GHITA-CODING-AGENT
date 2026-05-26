// ==============================================================================
// GHITA CODING AGENT - AI Gateway Server
// ==============================================================================
import { createServer } from 'http';
export class AIGatewayServer {
    orchestrator;
    config;
    server = null;
    // Trackers
    requestCounts = new Map();
    accumulatedCost = 0;
    auditLogs = [];
    // Metrics (Prometheus style counters/gauges)
    metrics = {
        httpRequestsTotal: 0,
        llmTokenUsageTotal: 0,
        llmCostTotal: 0,
        llmRequestDurationSecondsSum: 0,
    };
    constructor(orchestrator, config) {
        this.orchestrator = orchestrator;
        this.config = {
            port: config?.port ?? 3001,
            apiKey: config?.apiKey ?? 'ghita-admin-secret-key-2026',
            rateLimitLimit: config?.rateLimitLimit ?? 60,
            rateLimitWindowMs: config?.rateLimitWindowMs ?? 60000,
            monthlyBudget: config?.monthlyBudget ?? 100.0,
            piiFilteringEnabled: config?.piiFilteringEnabled ?? true,
        };
    }
    async start() {
        this.server = createServer(async (req, res) => {
            this.metrics.httpRequestsTotal++;
            const startTime = Date.now();
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
            const url = new URL(req.url ?? '', `http://${req.headers.host}`);
            // Route: /metrics (Prometheus)
            if (url.pathname === '/metrics') {
                res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
                res.end(this.generatePrometheusMetrics());
                return;
            }
            // Route: /v1/chat/completions (OpenAI Compatible)
            if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
                try {
                    // 1. Auth check
                    const authHeader = req.headers.authorization;
                    if (!authHeader || authHeader !== `Bearer ${this.config.apiKey}`) {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'Unauthorized: Invalid API Key' } }));
                        return;
                    }
                    // 2. Rate limit check
                    const ip = req.socket.remoteAddress || 'unknown';
                    if (this.isRateLimited(ip)) {
                        res.writeHead(429, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'Too Many Requests: Rate limit exceeded' } }));
                        return;
                    }
                    // 3. Budget check
                    if (this.accumulatedCost >= this.config.monthlyBudget) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'Quota Exceeded: Monthly budget reached' } }));
                        return;
                    }
                    const bodyBuffer = await this.readRequestBody(req);
                    const body = JSON.parse(bodyBuffer.toString());
                    // 4. Content / PII Filtering
                    if (this.config.piiFilteringEnabled) {
                        body.messages = this.filterPII(body.messages);
                    }
                    // Forward to Orchestrator
                    const chatResponse = await this.orchestrator.chat(body.messages, {
                        model: body.model,
                        maxTokens: body.max_tokens,
                        temperature: body.temperature,
                    });
                    // Calculate Cost
                    const cost = this.estimateCost(body.model || 'gpt-4o', chatResponse.usage);
                    this.accumulatedCost += cost;
                    this.metrics.llmCostTotal += cost;
                    this.metrics.llmTokenUsageTotal += chatResponse.usage.totalTokens;
                    // Audit log
                    this.logAudit({
                        timestamp: Date.now(),
                        model: body.model,
                        tokens: chatResponse.usage.totalTokens,
                        cost,
                        durationMs: Date.now() - startTime,
                    });
                    // Log latency metric
                    this.metrics.llmRequestDurationSecondsSum += (Date.now() - startTime) / 1000;
                    // Return OpenAI response
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        id: `chatcmpl-${Date.now().toString(36)}`,
                        object: 'chat.completion',
                        created: Math.floor(Date.now() / 1000),
                        model: chatResponse.model,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: 'assistant',
                                    content: chatResponse.content,
                                },
                                finish_reason: chatResponse.finishReason,
                            },
                        ],
                        usage: {
                            prompt_tokens: chatResponse.usage.promptTokens,
                            completion_tokens: chatResponse.usage.completionTokens,
                            total_tokens: chatResponse.usage.totalTokens,
                        },
                    }));
                }
                catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: e.message || 'Internal Server Error' } }));
                }
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Not Found' } }));
        });
        return new Promise((resolve) => {
            this.server?.listen(this.config.port, () => {
                resolve();
            });
        });
    }
    async stop() {
        if (this.server) {
            await new Promise((resolve) => {
                this.server?.close(() => resolve());
            });
        }
    }
    getAccumulatedCost() {
        return this.accumulatedCost;
    }
    getAuditLogs() {
        return this.auditLogs;
    }
    // --- Helpers ---
    async readRequestBody(req) {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        return Buffer.concat(chunks);
    }
    isRateLimited(key) {
        const now = Date.now();
        const timestamps = this.requestCounts.get(key) || [];
        const validTimestamps = timestamps.filter((t) => now - t < this.config.rateLimitWindowMs);
        if (validTimestamps.length >= this.config.rateLimitLimit) {
            return true;
        }
        validTimestamps.push(now);
        this.requestCounts.set(key, validTimestamps);
        return false;
    }
    filterPII(messages) {
        const piiRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        return messages.map((m) => {
            if (m.content && typeof m.content === 'string') {
                return {
                    ...m,
                    content: m.content.replace(piiRegex, '[CENSORED_EMAIL]'),
                };
            }
            return m;
        });
    }
    estimateCost(model, usage) {
        let promptRate = 2.5;
        let completionRate = 10.0;
        if (model.includes('mini')) {
            promptRate = 0.15;
            completionRate = 0.6;
        }
        else if (model.includes('gpt-4')) {
            promptRate = 5.0;
            completionRate = 15.0;
        }
        const promptCost = (usage.promptTokens / 1_000_000) * promptRate;
        const completionCost = (usage.completionTokens / 1_000_000) * completionRate;
        return promptCost + completionCost;
    }
    logAudit(log) {
        this.auditLogs.push(log);
        if (this.auditLogs.length > 1000)
            this.auditLogs.shift();
    }
    generatePrometheusMetrics() {
        return `# HELP http_requests_total Total number of HTTP requests to the gateway
# TYPE http_requests_total counter
http_requests_total ${this.metrics.httpRequestsTotal}

# HELP llm_token_usage_total Cumulative total of tokens processed
# TYPE llm_token_usage_total counter
llm_token_usage_total ${this.metrics.llmTokenUsageTotal}

# HELP llm_cost_total Accumulated total estimated LLM cost in USD
# TYPE llm_cost_total counter
llm_cost_total ${this.metrics.llmCostTotal.toFixed(6)}

# HELP llm_request_duration_seconds Total cumulative duration of LLM calls in seconds
# TYPE llm_request_duration_seconds counter
llm_request_duration_seconds ${this.metrics.llmRequestDurationSecondsSum.toFixed(4)}
`;
    }
}
//# sourceMappingURL=gateway.js.map