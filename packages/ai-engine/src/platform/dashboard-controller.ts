// ==============================================================================
// GHITA CODING AGENT - Dashboard Controller
// ==============================================================================

import type { AIGatewayServer } from './gateway.js';

export interface DashboardStats {
  monthlyBudget: number;
  accumulatedCost: number;
  remainingBudget: number;
  totalRequests: number;
  activeApiKeys: string[];
  tokenUsageChart: Array<{ date: string; prompt: number; completion: number }>;
}

export class DashboardController {
  private gateway: AIGatewayServer;
  private apiKeys: string[] = ['ghita-admin-secret-key-2026'];
  private monthlyBudget = 100.0;

  constructor(gateway: AIGatewayServer) {
    this.gateway = gateway;
  }

  getStats(): DashboardStats {
    const cost = this.gateway.getAccumulatedCost();
    const logs = this.gateway.getAuditLogs();

    const tokenUsageChart = logs.map((log: any) => ({
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

  createAPIKey(): string {
    const key = `ghita-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`;
    this.apiKeys.push(key);
    return key;
  }

  updateBudget(newBudget: number): void {
    if (newBudget < 0) throw new Error('Budget must be positive');
    this.monthlyBudget = newBudget;
  }
}
