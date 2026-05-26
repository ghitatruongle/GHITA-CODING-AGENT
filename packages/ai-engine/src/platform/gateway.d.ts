import type { Orchestrator } from '../orchestrator.js';
export interface GatewayConfig {
    port?: number;
    apiKey?: string;
    rateLimitLimit?: number;
    rateLimitWindowMs?: number;
    monthlyBudget?: number;
    piiFilteringEnabled?: boolean;
}
export declare class AIGatewayServer {
    private orchestrator;
    private config;
    private server;
    private requestCounts;
    private accumulatedCost;
    private auditLogs;
    private metrics;
    constructor(orchestrator: Orchestrator, config?: GatewayConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    getAccumulatedCost(): number;
    getAuditLogs(): any[];
    private readRequestBody;
    private isRateLimited;
    private filterPII;
    private estimateCost;
    private logAudit;
    private generatePrometheusMetrics;
}
//# sourceMappingURL=gateway.d.ts.map