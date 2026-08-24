// @ghita/integration -- Health Check Aggregator

import type { ServiceHealth } from './types.js';

export class HealthCheckAggregator {
  private readonly checks = new Map<string, () => Promise<ServiceHealth>>();

  register(name: string, check: () => Promise<ServiceHealth>): void {
    this.checks.set(name, check);
  }

  async runAll(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: readonly ServiceHealth[];
  }> {
    const results: ServiceHealth[] = [];
    for (const [name, check] of this.checks) {
      try {
        results.push(await check());
      } catch {
        results.push({ name, status: 'unhealthy', latencyMs: 0 });
      }
    }
    const hasUnhealthy = results.some((r) => r.status === 'unhealthy');
    const hasDegraded = results.some((r) => r.status === 'degraded');
    return {
      overall: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
      services: results,
    };
  }
}
