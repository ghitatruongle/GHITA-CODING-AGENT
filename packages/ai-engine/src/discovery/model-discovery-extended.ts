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
  {
    providerType: 'vllm',
    displayName: 'vLLM (Local / Self-Hosted)',
    baseUrl: 'http://localhost:8000/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['VLLM_API_KEY'],
    free: true,
    category: 'local',
  },
  {
    providerType: 'nebius',
    displayName: 'Nebius AI Token Factory',
    baseUrl: 'https://api.studio.nebius.ai/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['NEBIUS_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'siliconflow',
    displayName: 'SiliconFlow (SiliconCloud)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['SILICONFLOW_API_KEY', 'SILICON_CLOUD_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'digitalocean',
    displayName: 'DigitalOcean GenAI Inference',
    baseUrl: 'https://inference.digitalocean.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['DIGITALOCEAN_AI_KEY', 'DO_GENAI_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'azure-openai',
    displayName: 'Azure OpenAI Service',
    baseUrl: 'https://api.openai.azure.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_KEY'],
    free: false,
    category: 'enterprise',
  },
  {
    providerType: 'bedrock',
    displayName: 'Amazon Bedrock (Anthropic/OpenAI)',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    authStyle: 'x-api-key',
    parseResponse: parseOpenAICompat,
    envVars: ['AWS_BEDROCK_API_KEY', 'AWS_ACCESS_KEY_ID'],
    free: false,
    category: 'enterprise',
  },
  {
    providerType: 'vertex-anthropic',
    displayName: 'Google Vertex AI (Claude)',
    baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['VERTEX_API_KEY', 'GCP_SERVICE_ACCOUNT_KEY'],
    free: false,
    category: 'enterprise',
  },
  {
    providerType: 'cloudflare-ai',
    displayName: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/ai/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['CLOUDFLARE_AI_TOKEN', 'CF_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'deepinfra',
    displayName: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['DEEPINFRA_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'hyperbolic',
    displayName: 'Hyperbolic AI',
    baseUrl: 'https://api.hyperbolic.xyz/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['HYPERBOLIC_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'zhipu',
    displayName: 'Zhipu AI (GLM-4)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['ZHIPU_API_KEY', 'GLM_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'qwen',
    displayName: 'Alibaba Qwen (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'baichuan',
    displayName: 'Baichuan AI',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['BAICHUAN_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'stepfun',
    displayName: 'StepFun (Step-1)',
    baseUrl: 'https://api.stepfun.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['STEPFUN_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'lmstudio',
    displayName: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: [],
    free: true,
    category: 'local',
  },
  {
    providerType: 'friendli',
    displayName: 'FriendliAI',
    baseUrl: 'https://api.friendli.ai/dedicated/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['FRIENDLI_TOKEN', 'FRIENDLI_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'octoai',
    displayName: 'OctoAI',
    baseUrl: 'https://text.octoai.run/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['OCTOAI_TOKEN', 'OCTOAI_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'baseten',
    displayName: 'Baseten AI',
    baseUrl: 'https://bridge.baseten.co/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['BASETEN_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'modal',
    displayName: 'Modal Labs AI',
    baseUrl: 'https://modal.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'lepton',
    displayName: 'Lepton AI',
    baseUrl: 'https://api.lepton.ai/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['LEPTON_API_TOKEN'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'anyscale',
    displayName: 'Anyscale Endpoints',
    baseUrl: 'https://api.endpoints.anyscale.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['ANYSCALE_CLI_TOKEN', 'ANYSCALE_API_KEY'],
    free: false,
    category: 'commercial',
  },
  {
    providerType: 'hunyuan',
    displayName: 'Tencent Hunyuan AI',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    authStyle: 'bearer',
    parseResponse: parseOpenAICompat,
    envVars: ['HUNYUAN_SECRET_KEY', 'TENCENT_API_KEY'],
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
