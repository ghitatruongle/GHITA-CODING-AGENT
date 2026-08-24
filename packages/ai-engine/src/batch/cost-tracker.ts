// Tracks cost entries for every batch execution, supports summary queries.

import type { AIProviderType } from '@ghita/shared';
import type { BatchCostEntry, BatchCostSummary } from './types.js';

// Default pricing (USD per 1K tokens) — used as a fallback when the adapter
// does not provide its own estimator.

const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-coder': { input: 0.00014, output: 0.00028 },
  kimi: { input: 0.001, output: 0.001 },
  minimax: { input: 0.001, output: 0.001 },
  default: { input: 0.001, output: 0.002 },
};

/** Estimate cost in USD for a given model + token counts. */
export function estimateCostUsd(
  model: string | undefined,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!model) model = 'default';
  const pricing =
    DEFAULT_PRICING[model] ?? (DEFAULT_PRICING['default'] as { input: number; output: number });
  const input = (promptTokens / 1000) * pricing.input;
  const output = (completionTokens / 1000) * pricing.output;
  return input + output;
}

// Cost Tracker

export class BatchCostTracker {
  private entries: BatchCostEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  /** Record a cost entry. */
  record(entry: BatchCostEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  /** Record multiple entries at once. */
  recordMany(entries: BatchCostEntry[]): void {
    for (const e of entries) this.record(e);
  }

  /** Get all recorded entries. */
  all(): BatchCostEntry[] {
    return [...this.entries];
  }

  /** Number of recorded entries. */
  size(): number {
    return this.entries.length;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries = [];
  }

  /** Summarize cost. */
  summary(): BatchCostSummary {
    const summary: BatchCostSummary = {
      totalBatches: 0,
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCostUsd: 0,
      averageCostPerBatch: 0,
      averageCostPerRequest: 0,
      totalTokensSaved: 0,
      averageSavingsRatio: 0,
      byProvider: {},
    };

    const batchIds = new Set<string>();
    const savingsByBatch = new Map<string, { saved: number; ratio: number }>();

    for (const e of this.entries) {
      batchIds.add(e.batchId);
      summary.totalPromptTokens += e.promptTokens;
      summary.totalCompletionTokens += e.completionTokens;
      summary.totalCostUsd += e.costUsd;

      const key = e.provider;
      if (!summary.byProvider[key]) {
        summary.byProvider[key] = { batches: 0, requests: 0, costUsd: 0, tokens: 0 };
      }
      const bp = summary.byProvider[key] as {
        batches: number;
        requests: number;
        costUsd: number;
        tokens: number;
      };
      bp.batches += 1;
      bp.requests += 1;
      bp.costUsd += e.costUsd;
      bp.tokens += e.promptTokens + e.completionTokens;

      const prev = savingsByBatch.get(e.batchId);
      if (e.tokensSaved !== undefined && e.savingsRatio !== undefined) {
        if (!prev || e.tokensSaved > prev.saved) {
          savingsByBatch.set(e.batchId, { saved: e.tokensSaved, ratio: e.savingsRatio });
        }
      }
    }

    summary.totalBatches = batchIds.size;
    summary.totalRequests = this.entries.length;
    summary.averageCostPerBatch =
      summary.totalBatches > 0 ? summary.totalCostUsd / summary.totalBatches : 0;
    summary.averageCostPerRequest =
      summary.totalRequests > 0 ? summary.totalCostUsd / summary.totalRequests : 0;

    let totalSaved = 0;
    let totalRatio = 0;
    for (const v of savingsByBatch.values()) {
      totalSaved += v.saved;
      totalRatio += v.ratio;
    }
    summary.totalTokensSaved = totalSaved;
    summary.averageSavingsRatio = savingsByBatch.size > 0 ? totalRatio / savingsByBatch.size : 0;

    return summary;
  }

  /** Get cost entries for a specific provider. */
  forProvider(provider: AIProviderType): BatchCostEntry[] {
    return this.entries.filter((e) => e.provider === provider);
  }

  /** Get cost entries within a time window. */
  inWindow(sinceMs: number, untilMs = Date.now()): BatchCostEntry[] {
    return this.entries.filter((e) => e.timestamp >= sinceMs && e.timestamp <= untilMs);
  }
}
