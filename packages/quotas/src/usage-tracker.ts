import type { UsageRecord, QuotaConfig, ModelPricing } from './types.js';

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { promptPer1k: 0.0025, completionPer1k: 0.01 },
  'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'claude-3-5-sonnet': { promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-haiku': { promptPer1k: 0.00025, completionPer1k: 0.00125 },
  'gemini-1.5-pro': { promptPer1k: 0.00125, completionPer1k: 0.005 },
  'gemini-1.5-flash': { promptPer1k: 0.000075, completionPer1k: 0.0003 },
  'deepseek-chat': { promptPer1k: 0.00014, completionPer1k: 0.00028 },
  kimi: { promptPer1k: 0.001, completionPer1k: 0.001 },
  minimax: { promptPer1k: 0.001, completionPer1k: 0.001 },
};

/**

 *

 *   tracker.record({ userId, provider, model, promptTokens, completionTokens });
 *   const summary = tracker.summary('user-1', periodStart, periodEnd);
 */
export class UsageTracker {
  private readonly records: UsageRecord[] = [];
  private readonly maxRecords: number;
  private readonly pricing: Record<string, ModelPricing>;
  private readonly onLog?: (message: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
  private idCounter = 0;

  constructor(
    config: Partial<QuotaConfig> & { pricing?: Record<string, ModelPricing> } = {},
    maxRecords = 100_000,
  ) {
    this.maxRecords = maxRecords;
    this.pricing = { ...DEFAULT_PRICING, ...config.pricing };
    this.onLog = config.logger;
  }

  record(
    input: Omit<UsageRecord, 'id' | 'costUsd' | 'totalTokens' | 'timestamp'> & {
      timestamp?: number;
      id?: string;
    },
  ): UsageRecord {
    const totalTokens = input.promptTokens + input.completionTokens;
    const costUsd = this.calculateCost(input.model, input.promptTokens, input.completionTokens);
    this.idCounter++;
    const record: UsageRecord = {
      id: input.id ?? `usage_${Date.now().toString(36)}_${this.idCounter}`,
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens,
      costUsd,
      timestamp: input.timestamp ?? Date.now(),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    };

    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      const dropped = this.records.length - this.maxRecords;
      this.records.splice(0, dropped);
      this.onLog?.(`UsageTracker evicted ${dropped} oldest records`, 'warn');
    }
    return record;
  }

  query(
    userId: string,
    periodStart: number,
    periodEnd: number,
    provider?: string,
    model?: string,
  ): UsageRecord[] {
    return this.records.filter((r) => {
      if (r.userId !== userId) return false;
      if (r.timestamp < periodStart || r.timestamp > periodEnd) return false;
      if (provider && r.provider !== provider) return false;
      if (model && r.model !== model) return false;
      return true;
    });
  }

  summary(userId: string, periodStart: number, periodEnd: number) {
    const records = this.query(userId, periodStart, periodEnd);
    const byProvider: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {};
    let totalTokens = 0;
    let totalCost = 0;

    for (const r of records) {
      totalTokens += r.totalTokens;
      totalCost += r.costUsd;

      const p = byProvider[r.provider] ?? { requests: 0, tokens: 0, cost: 0 };
      p.requests += 1;
      p.tokens += r.totalTokens;
      p.cost += r.costUsd;
      byProvider[r.provider] = p;

      const m = byModel[r.model] ?? { requests: 0, tokens: 0, cost: 0 };
      m.requests += 1;
      m.tokens += r.totalTokens;
      m.cost += r.costUsd;
      byModel[r.model] = m;
    }

    return {
      userId,
      periodStart,
      periodEnd,
      totalRequests: records.length,
      totalTokens,
      totalCost,
      byProvider,
      byModel,
    };
  }

  all(): UsageRecord[] {
    return [...this.records];
  }

  forget(userId: string): number {
    let n = 0;
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (this.records[i]?.userId === userId) {
        this.records.splice(i, 1);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this.records.length = 0;
    this.idCounter = 0;
  }

  /**
   * Set pricing cho model.
   */
  setPricing(model: string, pricing: ModelPricing): void {
    this.pricing[model] = pricing;
  }

  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const p = this.pricing[model] ?? { promptPer1k: 0.001, completionPer1k: 0.002 };
    return (promptTokens / 1000) * p.promptPer1k + (completionTokens / 1000) * p.completionPer1k;
  }

  /**
   * Stats.
   */
  stats(): { totalRecords: number; uniqueUsers: number } {
    const userSet = new Set<string>();
    for (const r of this.records) userSet.add(r.userId);
    return { totalRecords: this.records.length, uniqueUsers: userSet.size };
  }
}
