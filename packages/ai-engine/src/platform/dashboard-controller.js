// ==============================================================================
// GHITA CODING AGENT - Dashboard Controller
// ==============================================================================
export class DashboardController {
    gateway;
    apiKeys = ['ghita-admin-secret-key-2026'];
    monthlyBudget = 100.0;
    constructor(gateway) {
        this.gateway = gateway;
    }
    getStats() {
        const cost = this.gateway.getAccumulatedCost();
        const logs = this.gateway.getAuditLogs();
        const tokenUsageChart = logs.map((log) => ({
            date: new Date(log.timestamp).toLocaleTimeString(),
            prompt: Math.floor(log.tokens * 0.4),
            completion: Math.floor(log.tokens * 0.6),
        }));
        return {
            monthlyBudget: this.monthlyBudget,
            accumulatedCost: cost,
            remainingBudget: Math.max(0, this.monthlyBudget - cost),
            totalRequests: logs.length,
            activeApiKeys: [...this.apiKeys],
            tokenUsageChart,
        };
    }
    createAPIKey() {
        const key = `ghita-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`;
        this.apiKeys.push(key);
        return key;
    }
    updateBudget(newBudget) {
        if (newBudget < 0)
            throw new Error('Budget must be positive');
        this.monthlyBudget = newBudget;
    }
}
//# sourceMappingURL=dashboard-controller.js.map