import type { AIGatewayServer } from './gateway.js';
export interface DashboardStats {
    monthlyBudget: number;
    accumulatedCost: number;
    remainingBudget: number;
    totalRequests: number;
    activeApiKeys: string[];
    tokenUsageChart: Array<{
        date: string;
        prompt: number;
        completion: number;
    }>;
}
export declare class DashboardController {
    private gateway;
    private apiKeys;
    private monthlyBudget;
    constructor(gateway: AIGatewayServer);
    getStats(): DashboardStats;
    createAPIKey(): string;
    updateBudget(newBudget: number): void;
}
//# sourceMappingURL=dashboard-controller.d.ts.map