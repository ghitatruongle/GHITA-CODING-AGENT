import type { AIProviderType } from '@ghita/shared';

/** Per-model metadata entry. */
export interface ModelEntry {
  /** Unique model id, e.g. "gpt-4o", "claude-sonnet-4-20250514". */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Provider that serves this model. */
  provider: AIProviderType;
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Maximum output tokens. */
  maxOutputTokens: number;
  /** Input cost per 1M tokens (USD). */
  inputCostPer1M: number;
  /** Output cost per 1M tokens (USD). */
  outputCostPer1M: number;
  /** Whether the model supports tool/function calling. */
  supportsTools: boolean;
  /** Whether the model supports structured JSON output. */
  supportsJsonOutput: boolean;
  /** Whether the model supports vision/image input. */
  supportsVision: boolean;
  /** Whether the model supports reasoning/thinking tokens. */
  supportsThinking: boolean;
  /** Quality score 0-100 (higher = better). */
  qualityScore: number;
}

/** A failover group: ordered list of equivalent models across providers. */
export interface FailoverGroup {
  /** Group name, e.g. "flagship-chat", "fast-code". */
  name: string;
  /** Ordered model ids — first available wins. */
  modelIds: string[];
}

/** Round-robin state per failover group. */
interface RoundRobinState {
  index: number;
  lastUsed: number;
}

/**
 * ModelCatalog: centralized registry of model metadata + failover logic.
 * Provides lookup, context window queries, and round-robin selection within
 * failover groups.
 */
export class ModelCatalog {
  private readonly models = new Map<string, ModelEntry>();
  private readonly failoverGroups = new Map<string, FailoverGroup>();
  private readonly rrState = new Map<string, RoundRobinState>();

  /** Register a model entry. Overwrites if id already exists. */
  register(entry: ModelEntry): void {
    this.models.set(entry.id, entry);
  }

  /** Register multiple models at once. */
  registerAll(entries: ModelEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /** Register a failover group. */
  registerFailoverGroup(group: FailoverGroup): void {
    this.failoverGroups.set(group.name, group);
  }

  /** Look up a model by id. */
  get(modelId: string): ModelEntry | undefined {
    return this.models.get(modelId);
  }

  /** Get context window for a model (returns default 128k if unknown). */
  getContextWindow(modelId: string): number {
    return this.models.get(modelId)?.contextWindow ?? 128_000;
  }

  /** Get max output tokens for a model (returns default 4096 if unknown). */
  getMaxOutputTokens(modelId: string): number {
    return this.models.get(modelId)?.maxOutputTokens ?? 4096;
  }

  /** Estimate cost for a request given input/output token counts. */
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const entry = this.models.get(modelId);
    if (!entry) return 0;
    return (inputTokens * entry.inputCostPer1M + outputTokens * entry.outputCostPer1M) / 1_000_000;
  }

  /** List all registered model ids. */
  listModelIds(): string[] {
    return [...this.models.keys()];
  }

  /** List models by provider. */
  listByProvider(provider: AIProviderType): ModelEntry[] {
    return [...this.models.values()].filter((m) => m.provider === provider);
  }

  /** Find models supporting a specific capability. */
  findByCapability(capability: 'tools' | 'jsonOutput' | 'vision' | 'thinking'): ModelEntry[] {
    const key =
      capability === 'tools'
        ? 'supportsTools'
        : capability === 'jsonOutput'
          ? 'supportsJsonOutput'
          : capability === 'vision'
            ? 'supportsVision'
            : 'supportsThinking';
    return [...this.models.values()].filter((m) => m[key]);
  }

  // ---------------------------------------------------------------------------
  // Failover + Round-Robin
  // ---------------------------------------------------------------------------

  /**
   * Select the next model from a failover group using round-robin.
   * Skips models whose providers are in the `downProviders` set.
   * Returns undefined if no models in the group are available.
   */
  selectFromGroup(groupName: string, downProviders?: Set<AIProviderType>): ModelEntry | undefined {
    const group = this.failoverGroups.get(groupName);
    if (!group || group.modelIds.length === 0) return undefined;

    const state = this.rrState.get(groupName) ?? { index: 0, lastUsed: 0 };
    const startIdx = state.index;

    for (let i = 0; i < group.modelIds.length; i++) {
      const idx = (startIdx + i) % group.modelIds.length;
      const modelId = group.modelIds[idx];
      if (!modelId) continue;
      const entry = this.models.get(modelId);
      if (!entry) continue;
      if (downProviders && downProviders.has(entry.provider)) continue;

      // Found an available model — advance round-robin
      state.index = (idx + 1) % group.modelIds.length;
      state.lastUsed = Date.now();
      this.rrState.set(groupName, state);
      return entry;
    }

    return undefined;
  }

  /**
   * Given a preferred model id, return it if available, otherwise fall back
   * to the next model in its failover group (if any).
   */
  resolveWithFailover(preferredModelId: string, downProviders?: Set<AIProviderType>): ModelEntry {
    const preferred = this.models.get(preferredModelId);
    if (preferred && (!downProviders || !downProviders.has(preferred.provider))) {
      return preferred;
    }

    // Try to find a failover group containing this model
    for (const [groupName, group] of this.failoverGroups) {
      if (group.modelIds.includes(preferredModelId)) {
        const fallback = this.selectFromGroup(groupName, downProviders);
        if (fallback) return fallback;
      }
    }

    // No failover available — return preferred anyway (caller handles errors)
    if (preferred) return preferred;
    const first = this.models.values().next().value;
    if (first) return first;
    throw new Error('No models registered in catalog');
  }

  /** Get all failover group names. */
  listFailoverGroups(): string[] {
    return [...this.failoverGroups.keys()];
  }

  /** Total number of registered models. */
  get size(): number {
    return this.models.size;
  }
}

// ---------------------------------------------------------------------------
// Default catalog data (populated at module load)
// ---------------------------------------------------------------------------

/** Create a pre-populated ModelCatalog with common models. */
export function createDefaultCatalog(): ModelCatalog {
  const catalog = new ModelCatalog();

  catalog.registerAll([
    // OpenAI
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: false,
      qualityScore: 90,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.6,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: false,
      qualityScore: 75,
    },
    {
      id: 'o3',
      name: 'o3',
      provider: 'openai',
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      inputCostPer1M: 10,
      outputCostPer1M: 40,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: true,
      qualityScore: 95,
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      provider: 'openai',
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      inputCostPer1M: 1.1,
      outputCostPer1M: 4.4,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: false,
      supportsThinking: true,
      qualityScore: 85,
    },

    // Anthropic
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      inputCostPer1M: 3,
      outputCostPer1M: 15,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: true,
      qualityScore: 92,
    },
    {
      id: 'claude-opus-4-20250514',
      name: 'Claude Opus 4',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      inputCostPer1M: 15,
      outputCostPer1M: 75,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: true,
      qualityScore: 97,
    },
    {
      id: 'claude-haiku-3-5-20241022',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      inputCostPer1M: 0.8,
      outputCostPer1M: 4,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: false,
      qualityScore: 78,
    },

    // Google
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      contextWindow: 1_000_000,
      maxOutputTokens: 65_536,
      inputCostPer1M: 1.25,
      outputCostPer1M: 10,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: true,
      qualityScore: 93,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'google',
      contextWindow: 1_000_000,
      maxOutputTokens: 65_536,
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.6,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: true,
      qualityScore: 82,
    },

    // xAI
    {
      id: 'grok-3',
      name: 'Grok 3',
      provider: 'xai',
      contextWindow: 131_072,
      maxOutputTokens: 16_384,
      inputCostPer1M: 3,
      outputCostPer1M: 15,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: true,
      supportsThinking: true,
      qualityScore: 88,
    },

    // Ollama (local — zero cost)
    {
      id: 'llama3',
      name: 'Llama 3',
      provider: 'ollama',
      contextWindow: 8_192,
      maxOutputTokens: 4_096,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      supportsTools: false,
      supportsJsonOutput: false,
      supportsVision: false,
      supportsThinking: false,
      qualityScore: 65,
    },
    {
      id: 'qwen3:32b',
      name: 'Qwen3 32B',
      provider: 'ollama',
      contextWindow: 32_768,
      maxOutputTokens: 8_192,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      supportsTools: true,
      supportsJsonOutput: true,
      supportsVision: false,
      supportsThinking: true,
      qualityScore: 80,
    },
  ]);

  // Default failover groups
  catalog.registerFailoverGroup({
    name: 'flagship-chat',
    modelIds: ['claude-sonnet-4-20250514', 'gpt-4o', 'gemini-2.5-pro', 'grok-3'],
  });
  catalog.registerFailoverGroup({
    name: 'fast-code',
    modelIds: ['gpt-4o-mini', 'gemini-2.5-flash', 'claude-haiku-3-5-20241022'],
  });
  catalog.registerFailoverGroup({
    name: 'reasoning',
    modelIds: ['o3', 'claude-opus-4-20250514', 'gemini-2.5-pro', 'o3-mini'],
  });

  return catalog;
}
