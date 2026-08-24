// Syncable model price metadata (cost per 1k tokens, context window). A small
// built-in table ships by default; `sync()` replaces it with upstream data.

export interface ModelPrice {
  /** "provider:model" id. */
  id: string;
  provider: string;
  model: string;
  /** USD per 1k input tokens. */
  inputPer1k: number;
  /** USD per 1k output tokens. */
  outputPer1k: number;
  /** Context window in tokens. */
  contextWindow: number;
  /** ISO timestamp of last update. */
  updatedAt: string;
}

export interface PriceSyncFetcher {
  (): Promise<ModelPrice[]>;
}

export const DEFAULT_MODEL_PRICES: ModelPrice[] = [
  {
    id: 'openai:gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
    contextWindow: 128000,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'openai:gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    inputPer1k: 0.0025,
    outputPer1k: 0.01,
    contextWindow: 128000,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'openai:gpt-4.1',
    provider: 'openai',
    model: 'gpt-4.1',
    inputPer1k: 0.002,
    outputPer1k: 0.008,
    contextWindow: 1000000,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'anthropic:claude-haiku-4',
    provider: 'anthropic',
    model: 'claude-haiku-4',
    inputPer1k: 0.0008,
    outputPer1k: 0.004,
    contextWindow: 200000,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'anthropic:claude-sonnet-4',
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    contextWindow: 200000,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'anthropic:claude-opus-4',
    provider: 'anthropic',
    model: 'claude-opus-4',
    inputPer1k: 0.015,
    outputPer1k: 0.075,
    contextWindow: 200000,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'google:gemini-2.0-flash',
    provider: 'google',
    model: 'gemini-2.0-flash',
    inputPer1k: 0.0001,
    outputPer1k: 0.0004,
    contextWindow: 1000000,
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export interface PriceLookup {
  price?: ModelPrice;
  /** Reason when nothing matched. */
  reason: string;
}

export class ModelPricingDB {
  private prices = new Map<string, ModelPrice>();

  constructor(initial: ModelPrice[] = DEFAULT_MODEL_PRICES) {
    for (const p of initial) this.prices.set(p.id, p);
  }

  /** Replace the whole table (from upstream sync). */
  replaceAll(prices: ModelPrice[]): number {
    this.prices.clear();
    for (const p of prices) this.prices.set(p.id, p);
    return this.prices.size;
  }

  upsert(price: ModelPrice): void {
    this.prices.set(price.id, price);
  }

  /** Exact lookup by "provider:model" id. */
  get(id: string): ModelPrice | undefined {
    return this.prices.get(id);
  }

  /**
   * Fuzzy lookup: try exact id, then provider+model, then substring match
   * (model alias/version tolerance).
   */
  lookup(provider: string, model: string): PriceLookup {
    const exact = this.prices.get(`${provider}:${model}`);
    if (exact) return { price: exact, reason: 'exact match' };

    const byProvider = [...this.prices.values()].filter((p) => p.provider === provider);
    const normalized = model.toLowerCase();
    const fuzzy = byProvider.find(
      (p) =>
        normalized.includes(p.model.toLowerCase()) || p.model.toLowerCase().includes(normalized),
    );
    if (fuzzy) return { price: fuzzy, reason: `fuzzy match → ${fuzzy.model}` };
    return { reason: `no price for ${provider}:${model}` };
  }

  /** Sync from a fetcher (e.g. remote pricing JSON). */
  async sync(fetcher: PriceSyncFetcher): Promise<{ count: number; at: string }> {
    const remote = await fetcher();
    const at = new Date().toISOString();
    const stamped = remote.map((p) => ({ ...p, updatedAt: at }));
    const count = this.replaceAll(stamped);
    return { count, at };
  }

  count(): number {
    return this.prices.size;
  }

  toJSON(): ModelPrice[] {
    return [...this.prices.values()];
  }
}

/** Estimate the cost of a conversation (prompt + completion tokens). */
export function estimateCost(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * price.inputPer1k + (outputTokens / 1000) * price.outputPer1k;
}
