// Static registry of all supported AI providers (endpoints, models, parsers).
// Extracted from ApiManager.tsx to separate data from presentation.

import {
  formatModelLabel as formatModelLabelUtil,
  parseModelLabel as parseModelLabelUtil,
} from '../../utils/modelLabel';

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'custom'
  | 'opengateway'
  | 'mimo'
  | 'openrouter'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'hicap'
  | 'github-models'
  // Phase 1.2: New providers
  | 'cerebras'
  | 'together'
  | 'fireworks'
  | 'cohere'
  | 'xai'
  | 'replicate'
  | 'perplexity'
  | 'voyage'
  | 'ai21'
  | 'sambanova'
  | 'novita'
  | 'opencode-zen'
  | 'nvidia-nim';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  icon: string;
  baseUrl: string;
  keyPlaceholder: string;
  defaultModels: string[];
  category: 'free' | 'paid' | 'custom';
  fetchModelsUrl?: (key: string, baseUrl: string) => string;
  parseModels?: (data: unknown) => string[];
  /** Convert API model name to display label (e.g. "DeepSeek V4 Flash Free" -> "DEEPSEEK-V4-FLASH-FREE"). */
  formatModelLabel?: (apiName: string) => string;
  /** Convert display label back to API model name. Receives the user-typed/selected display form and the list of available API names. */
  parseModelLabel?: (displayLabel: string, availableApiNames: string[]) => string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'opencode-zen',
    name: 'OpenCode Zen',
    icon: '🧘',
    baseUrl: 'https://opencode.ai/zen/v1',
    keyPlaceholder: 'OCZ_API_KEY (miễn phí — không bắt buộc)',
    defaultModels: [
      'minimax-m3-free',
      'deepseek-v4-flash-free',
      'mimo-v2.5-free',
      'nemotron-3-super-free',
    ],
    category: 'free',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
    formatModelLabel: (apiName) => formatModelLabelUtil('opencode-zen', apiName),
    parseModelLabel: (label, available) => parseModelLabelUtil('opencode-zen', label, available),
  },
  {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    icon: '🟢',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyPlaceholder: 'nvapi-...',
    defaultModels: [
      'nvidia/nemotron-3-super-120b-a12b',
      'z-ai/glm-5.1',
      'stepfun-ai/step-3.7-flash',
      'moonshotai/kimi-k2.6',
      'mistralai/mistral-medium-3.5-128b',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      'deepseek-ai/deepseek-v4-flash',
      'nvidia/ising-calibration-1-35b-a3b',
      'minimaxai/minimax-m2.7',
      'google/gemma-4-31b-it',
      'mistralai/mistral-small-4-119b-2603',
      'qwen/qwen3.5-122b-a10b',
      'qwen/qwen3.5-397b-a17b',
      'stepfun-ai/step-3.5-flash',
    ],
    category: 'free',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
    formatModelLabel: (apiName) => formatModelLabelUtil('nvidia-nim', apiName),
    parseModelLabel: (label, available) => parseModelLabelUtil('nvidia-nim', label, available),
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    icon: '🦙',
    baseUrl: 'http://localhost:11434',
    keyPlaceholder: 'Không cần key',
    defaultModels: ['llama3', 'codellama', 'mistral'],
    category: 'free',
    fetchModelsUrl: (_key, base) => `${base}/api/tags`,
    parseModels: (data) => {
      const d = data as { models?: { name: string }[] };
      return (d.models ?? []).map((m) => m.name).sort();
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🟢',
    baseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🟣',
    baseUrl: 'https://api.anthropic.com',
    keyPlaceholder: 'sk-ant-...',
    defaultModels: [
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    category: 'paid',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    icon: '🔵',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyPlaceholder: 'AIza...',
    defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    category: 'paid',
    fetchModelsUrl: (key, base) => `${base}/v1beta/models?key=${key}`,
    parseModels: (data) => {
      const d = data as { models?: { name: string }[] };
      return (d.models ?? []).map((m) => m.name.replace('models/', '')).sort();
    },
  },
  {
    id: 'opengateway',
    name: 'Gitlawb Opengateway',
    icon: '🌐',
    baseUrl: 'https://opengateway.gitlawb.com/v1',
    keyPlaceholder: 'Nhập API key...',
    defaultModels: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-pro', 'mimo-v2-omni', 'mimo-v2-flash'],
    category: 'paid',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🔀',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-...',
    defaultModels: [
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'meta-llama/llama-3.1-70b-instruct',
    ],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔍',
    baseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'sk-...',
    defaultModels: ['deepseek-chat', 'deepseek-coder'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'groq',
    name: 'Groq',
    icon: '⚡',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_...',
    defaultModels: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'mistral',
    name: 'Mistral',
    icon: '🌊',
    baseUrl: 'https://api.mistral.ai/v1',
    keyPlaceholder: 'Nhập Mistral API key...',
    defaultModels: ['mistral-large-latest', 'mistral-medium-latest', 'open-mistral-nemo'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'mimo',
    name: 'Xiaomi MiMo',
    icon: '🤖',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    keyPlaceholder: 'MIMO_API_KEY',
    defaultModels: ['mimo-v2.5-pro', 'mimo-v2-lite'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'github-models',
    name: 'GitHub Models',
    icon: '🐙',
    baseUrl: 'https://models.inference.ai.azure.com',
    keyPlaceholder: 'ghp_...',
    defaultModels: ['gpt-4o', 'Meta-Llama-3.1-70B-Instruct', 'Mistral-large'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  
  {
    id: 'cerebras',
    name: 'Cerebras',
    icon: '⚡',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyPlaceholder: 'csk-...',
    defaultModels: ['llama3.1-8b', 'llama3.1-70b'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'together',
    name: 'Together AI',
    icon: '🤝',
    baseUrl: 'https://api.together.xyz/v1',
    keyPlaceholder: 'Nhập Together API key...',
    defaultModels: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    icon: '🎆',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    keyPlaceholder: 'Nhập Fireworks API key...',
    defaultModels: [
      'accounts/fireworks/models/llama-v3p1-8b-instruct',
      'accounts/fireworks/models/llama-v3p1-70b-instruct',
    ],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'cohere',
    name: 'Cohere',
    icon: '🔷',
    baseUrl: 'https://api.cohere.com/v2',
    keyPlaceholder: 'Nhập Cohere API key...',
    defaultModels: ['command-r-plus', 'command-r', 'command-light'],
    category: 'paid',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    icon: '❌',
    baseUrl: 'https://api.x.ai/v1',
    keyPlaceholder: 'Nhập xAI API key...',
    defaultModels: ['grok-beta', 'grok-2'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'replicate',
    name: 'Replicate',
    icon: '🔁',
    baseUrl: 'https://api.replicate.com/v1',
    keyPlaceholder: 'r8_...',
    defaultModels: ['meta/llama-3.1-8b-instruct', 'meta/llama-3.1-70b-instruct'],
    category: 'paid',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: '🔎',
    baseUrl: 'https://api.perplexity.ai',
    keyPlaceholder: 'Nhập Perplexity API key...',
    defaultModels: ['llama-3.1-sonar-small-128k-online', 'llama-3.1-sonar-large-128k-online'],
    category: 'paid',
  },
  {
    id: 'voyage',
    name: 'Voyage AI',
    icon: '🧭',
    baseUrl: 'https://api.voyageai.com/v1',
    keyPlaceholder: 'Nhập Voyage AI key...',
    defaultModels: ['voyage-3', 'voyage-code-3'],
    category: 'paid',
  },
  {
    id: 'ai21',
    name: 'AI21 Labs',
    icon: '🧪',
    baseUrl: 'https://api.ai21.com/studio/v1',
    keyPlaceholder: 'Nhập AI21 API key...',
    defaultModels: ['jamba-1.5-large', 'jamba-1.5-mini'],
    category: 'paid',
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    icon: '🔥',
    baseUrl: 'https://api.sambanova.ai/v1',
    keyPlaceholder: 'Nhập SambaNova API key...',
    defaultModels: ['Meta-Llama-3.1-8B-Instruct', 'Meta-Llama-3.1-70B-Instruct'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'novita',
    name: 'Novita AI',
    icon: '🌟',
    baseUrl: 'https://api.novita.ai/v3/openai',
    keyPlaceholder: 'Nhập Novita API key...',
    defaultModels: ['meta-llama/llama-3.1-8b-instruct', 'meta-llama/llama-3.1-70b-instruct'],
    category: 'paid',
    fetchModelsUrl: (_key, base) => `${base}/models`,
    parseModels: (data) => {
      const d = data as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id).sort();
    },
  },
  {
    id: 'custom',
    name: 'Custom Provider',
    icon: '⚙️',
    baseUrl: '',
    keyPlaceholder: 'Nhập API key...',
    defaultModels: [],
    category: 'custom',
  },
  {
    id: 'hicap',
    name: 'Hicap',
    icon: '🔗',
    baseUrl: '',
    keyPlaceholder: 'Nhập API key...',
    defaultModels: [],
    category: 'custom',
  },
];

/** Provider lookup helper. */
export function getProvider(id: ProviderId): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
