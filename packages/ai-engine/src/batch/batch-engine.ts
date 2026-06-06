// ==============================================================================
// GHITA CODING AGENT - Batch Engine (Phase 27)
// Token-efficient request batching with multiple dispatch strategies.
// ==============================================================================

import type { ChatMessage, ChatOptions, ChatResponse } from '../types.js';
import type { AIProviderType } from '@ghita/shared';
import type {
  BatchEngineConfig,
  BatchEngineStats,
  BatchEvent,
  BatchEventListener,
  BatchExecution,
  BatchProviderAdapter,
  BatchRequest,
  BatchRequestResult,
  ConcatenatedPrompt,
} from './types.js';
import { DEFAULT_BATCH_CONFIG } from './types.js';
import { concatenateRequests } from './prompt-concatenator.js';
import {
  executeBatchesParallel,
  executeIndividual,
  type ProviderResolver,
} from './parallel-executor.js';
import { BatchCostTracker, estimateCostUsd } from './cost-tracker.js';

// ---------------------------------------------------------------------------
// Internal: extend BatchRequest with private resolvers (no leakage outside)
// ---------------------------------------------------------------------------

type PendingRequest = BatchRequest & {
  _resolve: (r: BatchRequestResult) => void;
  _reject: (e: Error) => void;
};

// ---------------------------------------------------------------------------
// Grouping key: requests with the same (provider, model, tag) can be batched.
// ---------------------------------------------------------------------------

function groupKey(r: BatchRequest): string {
  return `${r.provider}::${r.model ?? ''}::${r.tag ?? 'default'}`;
}

// ---------------------------------------------------------------------------
// Batch Engine
// ---------------------------------------------------------------------------

export class BatchEngine {
  private config: Required<BatchEngineConfig>;
  private adapters = new Map<string, BatchProviderAdapter>();
  private queue: PendingRequest[] = [];
  private inFlight = 0;
  private totalRequests = 0;
  private totalBatches = 0;
  private failedRequests = 0;
  private totalTokens = 0;
  private totalTokensSaved = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private costTracker: BatchCostTracker;
  private listeners: BatchEventListener[] = [];
  private startedAt = Date.now();
  private nextBatchId = 1;
  private nextRequestId = 1;
  private draining = false;

  constructor(config?: Partial<BatchEngineConfig>) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
    this.costTracker = new BatchCostTracker();
  }

  // --- Adapter registration -----------------------------------------------

  /** Register a provider adapter (so the engine can call into it). */
  registerAdapter(adapter: BatchProviderAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /** Bulk-register adapters. */
  registerAdapters(adapters: BatchProviderAdapter[]): void {
    for (const a of adapters) this.registerAdapter(a);
  }

  /** Remove a provider adapter. */
  unregisterAdapter(type: string): boolean {
    return this.adapters.delete(type);
  }

  private resolve: ProviderResolver = (type) => this.adapters.get(type);

  // --- Public API ---------------------------------------------------------

  /**
   * Enqueue a request and return a promise that resolves with the per-request
   * result when the batch is executed.
   */
  enqueue(
    request: Omit<BatchRequest, 'id' | 'enqueuedAt'>,
  ): Promise<BatchRequestResult> {
    const id = `req_${this.nextRequestId++}`;

    return new Promise<BatchRequestResult>((resolve, reject) => {
      const full: PendingRequest = {
        ...request,
        id,
        enqueuedAt: Date.now(),
        _resolve: resolve,
        _reject: reject,
      };

      this.queue.push(full);
      this.totalRequests++;
      this.emit({
        type: 'enqueued',
        request: full,
        queueDepth: this.queue.length,
      });

      this.maybeScheduleFlush();
    });
  }

  /**
   * Convenience helper: enqueue a chat request and return its response
   * directly, throwing on error.
   */
  async chat(
    provider: AIProviderType,
    messages: ChatMessage[],
    options?: ChatOptions & { tag?: string; priority?: number },
  ): Promise<ChatResponse> {
    const result = await this.enqueue({
      provider,
      messages,
      options,
      tag: options?.tag,
      priority: options?.priority,
      model: options?.model,
    });
    if (!result.ok || !result.response) {
      throw result.error ?? new Error('Batch request failed');
    }
    return result.response;
  }

  /** Force-flush all pending requests immediately. */
  async flush(): Promise<BatchExecution[]> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    return this.doFlush();
  }

  /** Get current engine statistics. */
  get stats(): BatchEngineStats {
    const ratio =
      this.totalTokens + this.totalTokensSaved > 0
        ? this.totalTokensSaved / (this.totalTokens + this.totalTokensSaved)
        : 0;
    return {
      totalRequests: this.totalRequests,
      totalBatches: this.totalBatches,
      averageBatchSize:
        this.totalBatches > 0 ? this.totalRequests / this.totalBatches : 0,
      queueDepth: this.queue.length,
      inFlight: this.inFlight,
      failedRequests: this.failedRequests,
      totalTokens: this.totalTokens,
      totalTokensSaved: this.totalTokensSaved,
      savingsRatio: ratio,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  /** Get the underlying cost tracker for external queries. */
  get costs(): BatchCostTracker {
    return this.costTracker;
  }

  // --- Event subscription ------------------------------------------------

  on(listener: BatchEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: BatchEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* listener error should not break engine */
      }
    }
  }

  // --- Internal: flush scheduling ----------------------------------------

  private maybeScheduleFlush(): void {
    if (this.config.strategy === 'none') {
      // No batching: flush immediately
      void this.flush();
      return;
    }

    if (this.config.strategy === 'size-window' || this.config.strategy === 'hybrid') {
      const groups = this.groupQueue();
      for (const group of groups) {
        if (group.length >= this.config.maxBatchSize) {
          void this.flush();
          return;
        }
      }
    }

    if (this.config.strategy === 'time-window' || this.config.strategy === 'hybrid') {
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          void this.flush();
        }, this.config.windowMs);
        if (
          this.flushTimer &&
          typeof this.flushTimer === 'object' &&
          'unref' in this.flushTimer
        ) {
          this.flushTimer.unref();
        }
      }
    }
  }

  private groupQueue(): PendingRequest[][] {
    const map = new Map<string, PendingRequest[]>();
    for (const r of this.queue) {
      const k = groupKey(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)?.push(r);
    }
    return Array.from(map.values());
  }

  // --- Internal: do the actual flush -------------------------------------

  private async doFlush(): Promise<BatchExecution[]> {
    if (this.draining) return [];
    if (this.queue.length === 0) return [];

    this.draining = true;
    try {
      const snapshot: PendingRequest[] = this.queue;
      this.queue = [];
      this.inFlight++;

      try {
        const groups = new Map<string, PendingRequest[]>();
        for (const r of snapshot) {
          const k = groupKey(r);
          if (!groups.has(k)) groups.set(k, []);
          const arr = groups.get(k) as PendingRequest[];
          if (arr.length < this.config.maxBatchSize) {
            arr.push(r);
          } else {
            const newKey = `${k}#${groups.size}`;
            groups.set(newKey, [r]);
          }
        }

        const executions: BatchExecution[] = [];

        const prompts: ConcatenatedPrompt[] = [];
        const promptToPending = new Map<ConcatenatedPrompt, PendingRequest[]>();
        for (const [, group] of groups) {
          if (group.length === 0) continue;
          try {
            const prompt = concatenateRequests(
              group,
              this.config.concatenation,
              this.config.maxTokensPerPrompt,
            );
            prompts.push(prompt);
            promptToPending.set(prompt, group);
          } catch (err) {
            if (this.config.autoFlushOnError) {
              const ind = await executeIndividual(
                group.map(stripPending),
                this.resolve,
                this.config.maxParallel,
              );
              for (const r of ind) this.resolvePending(group, r);
            } else {
              throw err;
            }
          }
        }

        if (this.config.parallelExecution && prompts.length > 0) {
          const batchResults = await executeBatchesParallel(
            prompts,
            this.resolve,
            this.config.maxParallel,
          );
          for (let i = 0; i < prompts.length; i++) {
            const prompt = prompts[i];
            if (!prompt) continue;
            const results = batchResults[i] ?? [];
            const group = promptToPending.get(prompt) ?? [];
            const exec = this.recordExecution(prompt, results);
            executions.push(exec);
            for (const r of results) this.resolvePending(group, r);
          }
        } else {
          for (const prompt of prompts) {
            const group = promptToPending.get(prompt) ?? [];
            const wrapped = await executeBatchesParallel(
              [prompt],
              this.resolve,
              this.config.maxParallel,
            );
            const results = wrapped[0] ?? [];
            const exec = this.recordExecution(prompt, results);
            executions.push(exec);
            for (const r of results) this.resolvePending(group, r);
          }
        }

        // Update aggregate stats
        for (const exec of executions) {
          for (const r of exec.results) {
            this.totalTokens += (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
            if (!r.ok) this.failedRequests++;
          }
        }
        this.totalBatches += executions.length;
        this.totalTokensSaved += executions.reduce(
          (sum, e) => sum + e.tokensSaved,
          0,
        );

        for (const exec of executions) {
          this.emit({ type: 'completed', batch: exec });
        }

        return executions;
      } finally {
        this.inFlight--;
        if (this.queue.length > 0) {
          this.maybeScheduleFlush();
        } else {
          this.emit({ type: 'queue-drained', remaining: this.queue.length });
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private recordExecution(
    prompt: ConcatenatedPrompt,
    results: BatchRequestResult[],
  ): BatchExecution {
    const batchId = `batch_${this.nextBatchId++}`;
    const totalCostUsd = results.reduce(
      (sum, r) =>
        sum +
        (r.costUsd ??
          estimateCostUsd(
            prompt.model,
            r.promptTokens ?? 0,
            r.completionTokens ?? 0,
          )),
      0,
    );
    const providerLatencyMs = Math.max(
      0,
      ...results.map((r) => r.providerLatencyMs),
    );
    const windowLatencyMs = Math.max(
      0,
      ...results.map((r) => r.queueLatencyMs),
    );

    const exec: BatchExecution = {
      batchId,
      tag: prompt.tag,
      provider: prompt.provider,
      model: prompt.model,
      size: prompt.requests.length,
      concatenation: this.config.concatenation,
      estimatedTokens: prompt.estimatedTokens,
      tokensSaved: prompt.tokensSaved,
      savingsRatio: prompt.savingsRatio,
      flushedAt: Date.now(),
      windowLatencyMs,
      results,
      totalCostUsd,
      providerLatencyMs,
    };

    if (this.config.trackCost) {
      const promptTokensTotal = results.reduce(
        (s, r) => s + (r.promptTokens ?? 0),
        0,
      );
      const completionTokensTotal = results.reduce(
        (s, r) => s + (r.completionTokens ?? 0),
        0,
      );
      this.costTracker.record({
        batchId,
        provider: prompt.provider,
        model: prompt.model ?? 'default',
        promptTokens: promptTokensTotal,
        completionTokens: completionTokensTotal,
        costUsd: totalCostUsd,
        timestamp: Date.now(),
        tokensSaved: prompt.tokensSaved,
        savingsRatio: prompt.savingsRatio,
      });
    }

    this.emit({ type: 'flushed', batch: exec });
    return exec;
  }

  private resolvePending(
    group: PendingRequest[],
    result: BatchRequestResult,
  ): void {
    const pending = group.find((g) => g.id === result.id);
    if (!pending) return;
    if (result.ok) {
      pending._resolve(result);
    } else {
      pending._reject(result.error ?? new Error('Batch request failed'));
    }
  }

  // --- Shutdown ----------------------------------------------------------

  /** Stop timers and reject all queued requests. */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const r of this.queue) {
      r._reject(new Error('BatchEngine destroyed'));
    }
    this.queue = [];
    this.listeners = [];
  }
}

function stripPending(r: PendingRequest): BatchRequest {
  const { _resolve, _reject, ...rest } = r;
  void _resolve;
  void _reject;
  return rest;
}
