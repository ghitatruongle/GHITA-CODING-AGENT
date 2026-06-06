// ==============================================================================
// GHITA CODING AGENT - Model Discovery Extensions (Phase 10)
// Built on top of ModelDiscovery (model-discovery.ts):
//  - discoverAll() with provider presets (OpenAI, Anthropic, Opengateway, Ollama)
//  - getStats() cho cache metrics
//  - invalidateAll() bulk clear
//  - PRESETS catalog với baseUrl + auth style + parser
// ==============================================================================

import {
  ModelDiscovery,
  parseOpenAICompat,
  parseOllamaTags,
  parseGoogleModels,
} from './model-discovery.js';
import type { DiscoveryConfig, DiscoveryResult } from './types.js';

/** Provider preset - shortcuts to construct DiscoveryConfig từ provider name */
export interface ProviderPreset {
  providerType: string;
  displayName: string;
  baseUrl: string;
  authStyle: 'bearer' | 'x-api-key' | 'query-param';
  parseResponse: (data: unknown) => Array<{ id: string; name: string; provider: string }>;
  /** Env var names (for SecureKeyLoader integration) */
  envVars: string[];
  /** Whether this provider is "free / no-auth" */
  free: boolean;
  /** Category for grouping */
  category: 'commercial' | 'free' | 'local' | 'enterprise';
}

/** Built-in provider presets */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    providerType: 'opengateway',
    displayName: 'Opengateway (Free)',
    baseUrl: 'https://api.opengateway.ai/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['OPENGATEWAY_API_KEY', 'OPEN_GATEWAY_KEY'],
    free: true,
    category: 'free',
  },
  {
    providerType: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['OPENAI_API_KEY', 'OPENAI_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    authStyle: 'x-api-key',
    parseResponse: parseOpenAICompat,
    envVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'ollama',
    displayName: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/api',
    authStyle: 'bearer',
    parseResponse: parseOllamaTags,
    envVars: [],
    free: true,
    category: 'local',
  },
  {
    providerType: 'google',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authStyle: 'query-param',
    parseResponse: parseGoogleModels,
    envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['GROQ_API_KEY', 'GROQ_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['DEEPSEEK_API_KEY', 'DEEPSEEK_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['OPENROUTER_API_KEY', 'OPENROUTER_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'mistral',
    displayName: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['MISTRAL_API_KEY', 'MISTRAL_KEY'],
    free: false,
    category: 'commercial',
  },
];

/** Build DiscoveryConfig từ preset + optional API key */
export function buildConfigFromPreset(preset: ProviderPreset, apiKey?: string): DiscoveryConfig {
  return {
    baseUrl: preset.baseUrl,
    apiKey,
    providerType: preset.providerType,
    authStyle: preset.authStyle,
    parseResponse: (data) => {
      const models = preset.parseResponse(data);
      return models.map((m) => ({ ...m, provider: preset.providerType }));
    },
  };
}

/** Extended ModelDiscovery wrapper - composes the base class with preset helpers + stats */
export class ModelDiscoveryExtended {
  private base: ModelDiscovery;
  private registeredProviders = new Set<string>();

  constructor(base?: ModelDiscovery) {
    this.base = base ?? new ModelDiscovery();
  }

  /** Get underlying base instance */
  getBase(): ModelDiscovery {
    return this.base;
  }

  /** Discover models for a preset (auto-loads API key từ env) */
  async discoverPreset(preset: ProviderPreset): Promise<DiscoveryResult> {
    let apiKey: string | undefined;
    if (!preset.free && preset.envVars.length > 0) {
      for (const envVar of preset.envVars) {
        const v = process.env[envVar];
        if (v) {
          apiKey = v;
          break;
        }
      }
    }
    const config = buildConfigFromPreset(preset, apiKey);
    this.registeredProviders.add(preset.providerType);
    return this.base.discoverModels(config);
  }

  /** Discover all registered presets in parallel */
  async discoverAll(
    presets: ProviderPreset[] = PROVIDER_PRESETS,
  ): Promise<Map<string, DiscoveryResult>> {
    const out = new Map<string, DiscoveryResult>();
    const promises = presets.map(async (p) => {
      try {
        const result = await this.discoverPreset(p);
        out.set(p.providerType, result);
      } catch {
        // skip failed
      }
    });
    await Promise.allSettled(promises);
    return out;
  }

  /** Invalidate all caches */
  invalidateAll(): void {
    for (const p of this.registeredProviders) {
      this.base.invalidateCache(p);
    }
    this.registeredProviders.clear();
  }

  /** List cached providers */
  getCachedProviders(): string[] {
    return Array.from(this.registeredProviders);
  }

  /** Cache statistics */
  getStats(): {
    registeredProviders: number;
    cachedProviders: string[];
  } {
    return {
      registeredProviders: this.registeredProviders.size,
      cachedProviders: this.getCachedProviders(),
    };
  }
}
