// Runs multiple batched provider calls concurrently with concurrency control.

import type {
  BatchProviderAdapter,
  BatchRequest,
  BatchRequestResult,
  ConcatenatedPrompt,
} from './types.js';
import { splitResponse } from './prompt-concatenator.js';

// Provider Resolver

export type ProviderResolver = (type: string) => BatchProviderAdapter | undefined;

// Concurrency Limiter

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// Execute a single concatenated batch

export async function executeBatch(
  prompt: ConcatenatedPrompt,
  resolver: ProviderResolver,
): Promise<BatchRequestResult[]> {
  const adapter = resolver(prompt.provider);
  if (!adapter) {
    return prompt.requests.map((r) => ({
      id: r.id,
      ok: false,
      error: new Error(`No adapter registered for provider ${prompt.provider}`),
      queueLatencyMs: 0,
      providerLatencyMs: 0,
      totalLatencyMs: 0,
    }));
  }

  const t0 = Date.now();
  const response = await adapter.chat(prompt.messages, {
    model: prompt.model,
  });
  const providerLatencyMs = Date.now() - t0;

  const splits = splitResponse(response, prompt.requests);
  const promptTokens = response.usage?.promptTokens ?? 0;
  const completionTokens = response.usage?.completionTokens ?? 0;

  return prompt.requests.map((r, i) => {
    const queueLatencyMs = Math.max(0, t0 - r.enqueuedAt);
    return {
      id: r.id,
      ok: true,
      response: {
        ...response,
        content: splits[i]?.content ?? '',
      },
      queueLatencyMs,
      providerLatencyMs,
      totalLatencyMs: Date.now() - r.enqueuedAt,
      promptTokens: i === 0 ? promptTokens : Math.floor(promptTokens / prompt.requests.length),
      completionTokens:
        i === 0 ? completionTokens : Math.floor(completionTokens / prompt.requests.length),
      costUsd: adapter.estimateCost
        ? i === 0
          ? adapter.estimateCost(promptTokens, completionTokens, prompt.model)
          : 0
        : undefined,
    } satisfies BatchRequestResult;
  });
}

// Execute multiple batches in parallel with concurrency cap

export async function executeBatchesParallel(
  prompts: ConcatenatedPrompt[],
  resolver: ProviderResolver,
  maxParallel: number,
): Promise<BatchRequestResult[][]> {
  const sem = new Semaphore(maxParallel);
  const tasks = prompts.map(async (p) => {
    await sem.acquire();
    try {
      return await executeBatch(p, resolver);
    } finally {
      sem.release();
    }
  });
  return Promise.all(tasks);
}

// Execute individual (non-batched) requests in parallel

export async function executeIndividual(
  requests: BatchRequest[],
  resolver: ProviderResolver,
  maxParallel: number,
): Promise<BatchRequestResult[]> {
  const sem = new Semaphore(maxParallel);

  const tasks = requests.map(async (r) => {
    const adapter = resolver(r.provider);
    if (!adapter) {
      return {
        id: r.id,
        ok: false,
        error: new Error(`No adapter registered for provider ${r.provider}`),
        queueLatencyMs: 0,
        providerLatencyMs: 0,
        totalLatencyMs: 0,
      } satisfies BatchRequestResult;
    }

    await sem.acquire();
    const t0 = Date.now();
    try {
      const response = await adapter.chat(r.messages, r.options);
      return {
        id: r.id,
        ok: true,
        response,
        queueLatencyMs: Math.max(0, t0 - r.enqueuedAt),
        providerLatencyMs: Date.now() - t0,
        totalLatencyMs: Date.now() - r.enqueuedAt,
        promptTokens: response.usage?.promptTokens,
        completionTokens: response.usage?.completionTokens,
        costUsd: adapter.estimateCost
          ? adapter.estimateCost(
              response.usage?.promptTokens ?? 0,
              response.usage?.completionTokens ?? 0,
              response.model,
            )
          : undefined,
      } satisfies BatchRequestResult;
    } catch (err) {
      return {
        id: r.id,
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
        queueLatencyMs: Math.max(0, t0 - r.enqueuedAt),
        providerLatencyMs: Date.now() - t0,
        totalLatencyMs: Date.now() - r.enqueuedAt,
      } satisfies BatchRequestResult;
    } finally {
      sem.release();
    }
  });

  return Promise.all(tasks);
}
