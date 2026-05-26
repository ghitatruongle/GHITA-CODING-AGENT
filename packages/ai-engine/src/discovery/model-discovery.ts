// ==============================================================================
// GHITA CODING AGENT - Model Discovery
// Phase 1.3: Auto-discover models from provider APIs, cache with TTL
// ==============================================================================

import type { ModelInfo, DiscoveryResult, DiscoveryConfig, AuthStyle } from './types.js';

const DEFAULT_TTL_MS = 3_600_000; // 1 hour
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds

export class ModelDiscovery {
  private cache = new Map<string, DiscoveryResult>();

  /** Discover models for a specific provider */
  async discoverModels(config: DiscoveryConfig): Promise<DiscoveryResult> {
    const cacheKey = config.providerType;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
      return { ...cached, source: 'cache' };
    }

    try {
      const models = await this.fetchModels(config);
      const result: DiscoveryResult = {
        models,
        fetchedAt: Date.now(),
        ttl: config.ttlMs ?? DEFAULT_TTL_MS,
        source: 'api',
      };
      this.cache.set(cacheKey, result);
      return result;
    } catch {
      // Return stale cache if available
      if (cached) {
        return { ...cached, source: 'cache' };
      }
      throw new Error(`Failed to discover models for ${config.providerType}`);
    }
  }

  /** Get cached models without API call */
  getCachedModels(providerType: string): DiscoveryResult | null {
    return this.cache.get(providerType) ?? null;
  }

  /** Invalidate cache for a provider */
  invalidateCache(providerType: string): void {
    this.cache.delete(providerType);
  }

  /** Discover models for all providers in parallel */
  async refreshAll(configs: DiscoveryConfig[]): Promise<Map<string, DiscoveryResult>> {
    const results = new Map<string, DiscoveryResult>();
    const promises = configs.map(async (config) => {
      try {
        const result = await this.discoverModels(config);
        results.set(config.providerType, result);
      } catch {
        // Skip failed providers
      }
    });
    await Promise.allSettled(promises);
    return results;
  }

  // --- Private helpers ---

  private async fetchModels(config: DiscoveryConfig): Promise<ModelInfo[]> {
    const { baseUrl, apiKey, authStyle, parseResponse } = config;
    const url = this.buildModelsUrl(baseUrl, apiKey, authStyle);
    const headers = this.buildHeaders(apiKey, authStyle);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      return parseResponse(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildModelsUrl(baseUrl: string, apiKey?: string, authStyle?: AuthStyle): string {
    // Google uses key as query param
    if (authStyle === 'query-param' && apiKey) {
      return `${baseUrl}/v1beta/models?key=${apiKey}`;
    }
    // Standard /models endpoint
    return `${baseUrl.replace(/\/$/, '')}/models`;
  }

  private buildHeaders(apiKey?: string, authStyle?: AuthStyle): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!apiKey) return headers;

    switch (authStyle) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'x-api-key':
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      // query-param: no headers needed
    }
    return headers;
  }
}

// --- Built-in parsers ---

/** Parse OpenAI-compatible { data: [{ id }] } format */
export function parseOpenAICompat(data: unknown): ModelInfo[] {
  const d = data as { data?: { id: string }[] };
  return (d.data ?? []).map((m) => ({
    id: m.id,
    name: m.id,
    provider: '',
  }));
}

/** Parse Ollama { models: [{ name }] } format */
export function parseOllamaTags(data: unknown): ModelInfo[] {
  const d = data as { models?: { name: string }[] };
  return (d.models ?? []).map((m) => ({
    id: m.name,
    name: m.name,
    provider: 'ollama',
  }));
}

/** Parse Google { models: [{ name }] } format */
export function parseGoogleModels(data: unknown): ModelInfo[] {
  const d = data as { models?: { name: string }[] };
  return (d.models ?? []).map((m) => ({
    id: m.name.replace('models/', ''),
    name: m.name.replace('models/', ''),
    provider: 'google',
  }));
}

/** Parse Replicate { results: [{ name }] } format */
export function parseReplicateModels(data: unknown): ModelInfo[] {
  const d = data as { results?: { name: string }[] };
  return (d.results ?? []).map((m) => ({
    id: m.name,
    name: m.name,
    provider: 'replicate',
  }));
}
