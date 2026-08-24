import * as crypto from 'node:crypto';
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
  private apiKeys: string[] = (() => {
    const key =
      process.env.GHITA_ADMIN_API_KEY ||
      (process.env.NODE_ENV === 'test' ? 'mock-admin-key' : undefined);
    if (!key) throw new Error('GHITA_ADMIN_API_KEY environment variable is required');
    return [key];
  })();
  private monthlyBudget = 100.0;

  constructor(gateway: AIGatewayServer) {
    this.gateway = gateway;
  }

  getStats(): DashboardStats {
    const cost = this.gateway.getAccumulatedCost();
    const logs = this.gateway.getAuditLogs();

    const tokenUsageChart = logs.map((log: Record<string, unknown>) => ({
      date: new Date((log.timestamp as number | string) ?? Date.now()).toLocaleTimeString(),
      prompt: Math.floor(Number(log.tokens) * 0.4),
      completion: Math.floor(Number(log.tokens) * 0.6),
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
    const key = `ghita-${crypto.randomBytes(24).toString('hex')}-${Date.now().toString(36)}`;
    this.apiKeys.push(key);
    return key;
  }

  updateBudget(newBudget: number): void {
    if (newBudget < 0) throw new Error('Budget must be positive');
    this.monthlyBudget = newBudget;
  }
}
