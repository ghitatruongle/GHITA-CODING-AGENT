// ==============================================================================
// GHITA CODING AGENT - LiteLLM Multi-Provider Gateway & Key Rotation
// ==============================================================================
// Inspired by LiteLLM: Unified API wrapper for 100+ AI Providers with automatic
// key rotation, load balancing, and failover handling.
// ==============================================================================

import type { AIProviderType } from '@ghita/shared';

export interface ProviderKeyPair {
  provider: AIProviderType;
  apiKey: string;
  weight?: number;
  failureCount: number;
  lastUsed: number;
}

export class LiteLLMGateway {
  private keyPool: Map<string, ProviderKeyPair[]> = new Map();

  /**
   * Register API key for a given provider into the load balancing pool.
   */
  registerKey(provider: AIProviderType, apiKey: string, weight = 1): void {
    const pool = this.keyPool.get(provider) || [];
    pool.push({
      provider,
      apiKey,
      weight,
      failureCount: 0,
      lastUsed: 0,
    });
    this.keyPool.set(provider, pool);
  }

  /**
   * Select the best API key for a provider using round-robin / weight algorithm.
   */
  selectKey(provider: AIProviderType): string | undefined {
    const pool = this.keyPool.get(provider);
    if (!pool || pool.length === 0) return undefined;

    // Filter out keys with high failure counts (> 5)
    const healthyKeys = pool.filter((k) => k.failureCount < 5);
    const candidatePool = healthyKeys.length > 0 ? healthyKeys : pool;

    // Sort by lastUsed ascending
    candidatePool.sort((a, b) => a.lastUsed - b.lastUsed);
    const selected = candidatePool[0];

    if (selected) {
      selected.lastUsed = Date.now();
      return selected.apiKey;
    }

    return undefined;
  }

  /**
   * Report execution outcome for a provider key (to increment failure or reset).
   */
  reportOutcome(provider: AIProviderType, apiKey: string, success: boolean): void {
    const pool = this.keyPool.get(provider);
    if (!pool) return;

    const pair = pool.find((k) => k.apiKey === apiKey);
    if (pair) {
      if (success) {
        pair.failureCount = 0;
      } else {
        pair.failureCount += 1;
      }
    }
  }

  /**
   * Get failover provider fallback order if primary provider fails.
   */
  getFallbackOrder(primary: AIProviderType): AIProviderType[] {
    const defaultOrder: AIProviderType[] = [
      'openai',
      'anthropic',
      'google',
      'groq',
      'deepseek',
      'ollama',
    ];
    return [primary, ...defaultOrder.filter((p) => p !== primary)];
  }
}
