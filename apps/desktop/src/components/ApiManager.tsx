// ==============================================================================
// GHITA CODING AGENT — API Manager Component (v2 Redesign)
// Searchable, categorized, favorites, status badges
// ==============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n';
import { loadApiConfig, saveApiConfig, normalizeApiKeys } from '../utils/apiConfig';
import {
  formatModelLabel as formatModelLabelUtil,
  parseModelLabel as parseModelLabelUtil,
} from '../utils/modelLabel';

type ProviderId =
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

interface ProviderConfig {
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

const PROVIDERS: ProviderConfig[] = [
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
  // Phase 1.2: New providers
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
    keyPlaceholder: 'Nhập Voyage API key...',
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

type KeyRotationStrategy = 'round-robin' | 'failover' | 'random';

interface ApiKeyEntry {
  providerId: ProviderId;
  apiKeys: string[];
  baseUrl: string;
  selectedModel: string;
  active: boolean;
  availableModels: string[];
  isFetchingModels: boolean;
  fetchError: string | null;
  rotationStrategy: KeyRotationStrategy;
}

type ApiKeysState = Record<ProviderId, ApiKeyEntry>;

const FAVORITES_KEY = 'ghita_api_favorites';

function serializeApiKeysState(keys: ApiKeysState): Record<string, Record<string, unknown>> {
  const toSave: Record<string, Record<string, unknown>> = {};
  for (const [id, entry] of Object.entries(keys)) {
    toSave[id] = {
      apiKeys: entry.apiKeys,
      baseUrl: entry.baseUrl,
      selectedModel: entry.selectedModel,
      active: entry.active,
      availableModels: entry.availableModels,
      rotationStrategy: entry.rotationStrategy,
    };
  }
  return toSave;
}

function buildStateFromSnapshot(
  snapshot: Record<string, Record<string, unknown>> = {},
): ApiKeysState {
  const state = {} as ApiKeysState;
  for (const p of PROVIDERS) {
    const savedEntry = snapshot[p.id];
    let apiKeys: string[] = [];
    if (savedEntry) {
      apiKeys = normalizeApiKeys(savedEntry);
    }
    state[p.id] = {
      providerId: p.id,
      apiKeys,
      baseUrl: (savedEntry?.['baseUrl'] as string) ?? p.baseUrl,
      selectedModel: (savedEntry?.['selectedModel'] as string) ?? p.defaultModels[0] ?? '',
      active: (savedEntry?.['active'] as boolean) ?? false,
      availableModels: (savedEntry?.['availableModels'] as string[]) ?? p.defaultModels,
      isFetchingModels: false,
      fetchError: null,
      rotationStrategy: (savedEntry?.['rotationStrategy'] as KeyRotationStrategy) ?? 'failover',
    };
  }
  return state;
}

function loadFavorites(): Set<ProviderId> {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) return new Set(JSON.parse(saved) as ProviderId[]);
  } catch {
    /* ignore */
  }
  return new Set<ProviderId>();
}

function saveFavorites(favs: Set<ProviderId>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
  } catch {
    /* ignore */
  }
}

export function ApiManager() {
  const [keys, setKeys] = useState<ApiKeysState>(() => buildStateFromSnapshot());
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<ProviderId | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<ProviderId>>(loadFavorites);
  // Per-provider draft of the model input so the user can type freely without
  // the formatter rewriting the value on every keystroke. The draft is cleared
  // when the field is blurred or the stored value is replaced via fetch.
  const [modelDraft, setModelDraft] = useState<Partial<Record<ProviderId, string>>>({});
  const { t, lang } = useTranslation();

  const getPlaceholder = useCallback(
    (provider: ProviderConfig) => {
      if (
        provider.id === 'ollama' ||
        provider.id === 'opencode-zen'
      ) {
        return t('apiManager.noKeyNeeded');
      }
      if (
        provider.keyPlaceholder.startsWith('Nhập ') ||
        provider.keyPlaceholder.includes('API key') ||
        provider.keyPlaceholder.includes('key')
      ) {
        if (lang === 'vi') {
          return provider.keyPlaceholder.startsWith('Nhập')
            ? provider.keyPlaceholder
            : `Nhập ${provider.name} API key...`;
        } else if (lang === 'en') {
          return `Enter ${provider.name} API key...`;
        } else {
          return `请输入 ${provider.name} API key...`;
        }
      }
      return provider.keyPlaceholder;
    },
    [t, lang],
  );

  useEffect(() => {
    let cancelled = false;

    loadApiConfig()
      .then((snapshot) => {
        if (!cancelled) setKeys(buildStateFromSnapshot(snapshot));
      })
      .finally(() => {
        if (!cancelled) setIsConfigLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist API keys outside webview localStorage.
  useEffect(() => {
    if (!isConfigLoaded) return;

    try {
      void saveApiConfig(serializeApiKeysState(keys));
    } catch {
      /* ignore */
    }
  }, [keys, isConfigLoaded]);

  const updateKey = useCallback((id: ProviderId, patch: Partial<ApiKeyEntry>) => {
    setKeys((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const toggleFavorite = useCallback((id: ProviderId) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleSave = (id: ProviderId) => {
    const entry = keys[id];
    const needsNoKey = id === 'ollama' || id === 'opencode-zen';
    const input = document.getElementById(`new-key-${id}`) as HTMLInputElement | null;
    const pendingKey = input?.value?.trim();
    const apiKeys =
      pendingKey && !entry.apiKeys.includes(pendingKey)
        ? [...entry.apiKeys, pendingKey]
        : entry.apiKeys;
    const nextKeys = {
      ...keys,
      [id]: {
        ...entry,
        apiKeys,
        active: apiKeys.length > 0 || needsNoKey,
      },
    };
    if (input) input.value = '';
    setKeys(nextKeys);
    void saveApiConfig(serializeApiKeysState(nextKeys));
    setExpandedId(null);
  };

  const handleFetchModels = async (id: ProviderId) => {
    const entry = keys[id];
    const provider = PROVIDERS.find((p) => p.id === id);
    if (!provider?.fetchModelsUrl) return;

    updateKey(id, { isFetchingModels: true, fetchError: null });

    try {
      const activeKey = entry.apiKeys[0] ?? '';
      const url = provider.fetchModelsUrl(activeKey, entry.baseUrl);
      const headers: Record<string, string> = {};
      const openAiCompat = [
        'openai',
        'opengateway',
        'opencode-zen',
        'nvidia-nim',
        'mimo',
        'openrouter',
        'deepseek',
        'groq',
        'mistral',
        'hicap',
        'github-models',
        'cerebras',
        'together',
        'fireworks',
        'cohere',
        'xai',
        'replicate',
        'perplexity',
        'voyage',
        'ai21',
        'sambanova',
        'novita',
      ];
      if (activeKey && openAiCompat.includes(id)) {
        headers['Authorization'] = `Bearer ${activeKey}`;
      }
      if (activeKey && id === 'anthropic') {
        headers['x-api-key'] = activeKey;
        headers['anthropic-version'] = '2023-06-01';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let res: Response;
      try {
        res = await fetch(url, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const data = await res.json();
      const models = provider.parseModels?.(data) ?? provider.defaultModels;
      updateKey(id, {
        availableModels: models.length > 0 ? models : provider.defaultModels,
        selectedModel: models[0] ?? entry.selectedModel,
        isFetchingModels: false,
      });
    } catch (e) {
      updateKey(id, {
        isFetchingModels: false,
        fetchError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const maskKey = (key: string): string => {
    if (!key) return '';
    if (key.length <= 8) return '\u2022'.repeat(key.length);
    return key.slice(0, 4) + '\u2022'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  };

  // Filter + group
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return PROVIDERS;
    return PROVIDERS.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q));
  }, [search]);

  const activeCount = Object.values(keys).filter((k) => k.active).length;

  const groups = useMemo(() => {
    const favList = filtered.filter((p) => favorites.has(p.id));
    const freeList = filtered.filter((p) => p.category === 'free' && !favorites.has(p.id));
    const paidList = filtered.filter((p) => p.category === 'paid' && !favorites.has(p.id));
    const customList = filtered.filter((p) => p.category === 'custom' && !favorites.has(p.id));
    return [
      { label: t('apiManager.favorites'), emoji: '\u2B50', list: favList },
      { label: t('apiManager.freeLocal'), emoji: '\uD83C\uDF1F', list: freeList },
      { label: t('apiManager.paid'), emoji: '\uD83D\uDCB0', list: paidList },
      { label: t('apiManager.custom'), emoji: '\u2699\uFE0F', list: customList },
    ].filter((g) => g.list.length > 0);
  }, [filtered, favorites, t]);

  return (
    <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <h2
        style={{
          fontSize: '18px',
          fontWeight: 700,
          marginBottom: '4px',
          background: 'var(--accent-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {t('apiManager.title')}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '12px' }}>
        {activeCount > 0
          ? t('apiManager.activeProviders', { count: activeCount })
          : t('apiManager.addKeyHint')}
      </p>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <span
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '14px',
            opacity: 0.5,
          }}
        >
          🔍
        </span>
        <input
          type="text"
          placeholder={t('apiManager.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px 10px 36px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{group.emoji}</span> {group.label}
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '10px',
                  fontWeight: 500,
                  background: 'var(--bg-active)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--text-muted)',
                }}
              >
                {group.list.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {group.list.map((provider) => {
                const entry = keys[provider.id];
                const isExpanded = expandedId === provider.id;
                const isFav = favorites.has(provider.id);
                const status = entry.active
                  ? 'active'
                  : entry.apiKeys.length > 0
                    ? 'ready'
                    : 'none';

                return (
                  <div
                    key={provider.id}
                    style={{
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border:
                        status === 'active'
                          ? '1px solid rgba(34, 197, 94, 0.3)'
                          : status === 'ready'
                            ? '1px solid rgba(245, 158, 11, 0.2)'
                            : '1px solid var(--border-subtle)',
                      overflow: 'hidden',
                      transition: 'border-color var(--transition-fast)',
                    }}
                  >
                    {/* Header row */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : provider.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        gap: '10px',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Favorite star */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(provider.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '2px',
                          opacity: isFav ? 1 : 0.3,
                          transition: 'opacity 0.2s',
                        }}
                        title={isFav ? t('apiManager.removeFavorite') : t('apiManager.addFavorite')}
                      >
                        {isFav ? '\u2B50' : '\u2606'}
                      </button>

                      <span style={{ fontSize: '20px' }}>{provider.icon}</span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                          }}
                        >
                          {provider.name}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            marginTop: '1px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {status === 'active'
                            ? `${t('apiManager.model')}: ${(provider.formatModelLabel ? provider.formatModelLabel(entry.selectedModel) : entry.selectedModel) || '\u2014'}`
                            : status === 'ready'
                              ? maskKey(entry.apiKeys[0] ?? '')
                              : getPlaceholder(provider)}
                        </div>
                      </div>

                      {/* Status badge */}
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '10px',
                          fontWeight: 600,
                          background:
                            status === 'active'
                              ? 'var(--success-bg)'
                              : status === 'ready'
                                ? 'rgba(245, 158, 11, 0.1)'
                                : 'var(--bg-surface)',
                          color:
                            status === 'active'
                              ? 'var(--success)'
                              : status === 'ready'
                                ? '#f59e0b'
                                : 'var(--text-muted)',
                          border:
                            status === 'active'
                              ? '1px solid rgba(34, 197, 94, 0.3)'
                              : status === 'ready'
                                ? '1px solid rgba(245, 158, 11, 0.2)'
                                : '1px solid var(--border-subtle)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {status === 'active'
                          ? t('apiManager.active')
                          : status === 'ready'
                            ? t('apiManager.ready')
                            : t('apiManager.notSet')}
                      </span>

                      {/* Chevron */}
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 200ms',
                          fontSize: '10px',
                        }}
                      >
                        ▼
                      </span>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div
                        style={{
                          padding: '0 16px 16px',
                          borderTop: '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          paddingTop: '14px',
                        }}
                      >
                        {/* Phase 1.1: Multi-Key Management */}
                        <div>
                          <label style={labelStyle}>
                            {t('apiManager.apiKey')} (
                            {entry.apiKeys.length > 1
                              ? t('apiManager.keysCount', { count: entry.apiKeys.length })
                              : entry.apiKeys.length === 1
                                ? '1 key'
                                : t('apiManager.notSet')}
                            )
                          </label>
                          {/* Existing keys list */}
                          {entry.apiKeys.map((k, idx) => (
                            <div
                              key={idx}
                              style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}
                            >
                              <input
                                type={showKey === `${provider.id}-${idx}` ? 'text' : 'password'}
                                value={k}
                                readOnly
                                style={{ ...inputStyle, flex: 1, opacity: 0.8 }}
                              />
                              <button
                                onClick={() =>
                                  setShowKey(
                                    showKey === `${provider.id}-${idx}`
                                      ? null
                                      : `${provider.id}-${idx}`,
                                  )
                                }
                                style={iconBtnStyle}
                                title={
                                  showKey === `${provider.id}-${idx}`
                                    ? t('apiManager.hide')
                                    : t('apiManager.show')
                                }
                              >
                                {showKey === `${provider.id}-${idx}`
                                  ? '\uD83D\uDE48'
                                  : '\uD83D\uDC41\uFE0F'}
                              </button>
                              <button
                                onClick={() => {
                                  const newKeys = entry.apiKeys.filter((_, i) => i !== idx);
                                  updateKey(provider.id, {
                                    apiKeys: newKeys,
                                    active:
                                      newKeys.length > 0 ||
                                      provider.id === 'ollama' ||
                                      provider.id === 'opencode-zen',
                                  });
                                }}
                                style={{ ...iconBtnStyle, color: 'var(--error)' }}
                                title={t('apiManager.removeKey')}
                              >
                                {'\u274C'}
                              </button>
                            </div>
                          ))}
                          {/* Add new key input */}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <input
                              type={showKey === `${provider.id}-new` ? 'text' : 'password'}
                              defaultValue=""
                              placeholder={getPlaceholder(provider)}
                              id={`new-key-${provider.id}`}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSave(provider.id);
                                }
                              }}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <button
                              onClick={() =>
                                setShowKey(
                                  showKey === `${provider.id}-new` ? null : `${provider.id}-new`,
                                )
                              }
                              style={iconBtnStyle}
                            >
                              {showKey === `${provider.id}-new`
                                ? '\uD83D\uDE48'
                                : '\uD83D\uDC41\uFE0F'}
                            </button>
                            <button
                              onClick={() => {
                                const input = document.getElementById(
                                  `new-key-${provider.id}`,
                                ) as HTMLInputElement;
                                const newKey = input?.value?.trim();
                                if (newKey && !entry.apiKeys.includes(newKey)) {
                                  updateKey(provider.id, { apiKeys: [...entry.apiKeys, newKey] });
                                  if (input) input.value = '';
                                }
                              }}
                              style={iconBtnStyle}
                              title={t('apiManager.addKey')}
                            >
                              {'\u2795'}
                            </button>
                          </div>
                          {/* Rotation strategy selector */}
                          {entry.apiKeys.length > 1 && (
                            <div style={{ marginTop: '8px' }}>
                              <label style={labelStyle}>{t('apiManager.keyStrategy')}</label>
                              <select
                                value={entry.rotationStrategy}
                                onChange={(e) =>
                                  updateKey(provider.id, {
                                    rotationStrategy: e.target.value as KeyRotationStrategy,
                                  })
                                }
                                style={inputStyle}
                              >
                                <option value="failover">{t('apiManager.strategyFailover')}</option>
                                <option value="round-robin">
                                  {t('apiManager.strategyRoundRobin')}
                                </option>
                                <option value="random">{t('apiManager.strategyRandom')}</option>
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Base URL (editable for custom) */}
                        {provider.id === 'custom' && (
                          <div>
                            <label style={labelStyle}>{t('apiManager.baseUrl')}</label>
                            <input
                              type="text"
                              value={entry.baseUrl}
                              onChange={(e) => updateKey(provider.id, { baseUrl: e.target.value })}
                              placeholder="https://api.example.com/v1"
                              style={inputStyle}
                            />
                          </div>
                        )}

                        {/* Model selector */}
                        <div>
                          <label style={labelStyle}>{t('apiManager.model')}</label>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="text"
                              list={`models-list-${provider.id}`}
                              value={
                                modelDraft[provider.id] ??
                                (provider.formatModelLabel
                                  ? provider.formatModelLabel(entry.selectedModel)
                                  : entry.selectedModel)
                              }
                              onChange={(e) => {
                                const next = e.target.value;
                                setModelDraft((prev) => ({ ...prev, [provider.id]: next }));
                                if (provider.parseModelLabel) {
                                  updateKey(provider.id, {
                                    selectedModel: provider.parseModelLabel(
                                      next,
                                      entry.availableModels,
                                    ),
                                  });
                                } else {
                                  updateKey(provider.id, { selectedModel: next });
                                }
                              }}
                              onBlur={() => {
                                setModelDraft((prev) => {
                                  if (!(provider.id in prev)) return prev;
                                  const { [provider.id]: _omit, ...rest } = prev;
                                  return rest;
                                });
                              }}
                              placeholder={t('apiManager.selectModel')}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <datalist id={`models-list-${provider.id}`}>
                              {entry.availableModels.map((m) => {
                                const displayLabel = provider.formatModelLabel
                                  ? provider.formatModelLabel(m)
                                  : m;
                                return <option key={m} value={displayLabel} label={displayLabel} />;
                              })}
                            </datalist>

                            {provider.fetchModelsUrl && (
                              <button
                                onClick={() => handleFetchModels(provider.id)}
                                disabled={
                                  entry.isFetchingModels ||
                                  (entry.apiKeys.length === 0 &&
                                    provider.id !== 'ollama' &&
                                    provider.id !== 'opencode-zen')
                                }
                                style={{
                                  ...iconBtnStyle,
                                  opacity:
                                    entry.isFetchingModels ||
                                    (entry.apiKeys.length === 0 &&
                                      provider.id !== 'ollama' &&
                                      provider.id !== 'opencode-zen')
                                      ? 0.4
                                      : 1,
                                  whiteSpace: 'nowrap',
                                }}
                                title={t('apiManager.fetchModels')}
                              >
                                {entry.isFetchingModels ? '\u23F3' : '\uD83D\uDD04'}{' '}
                                {t('apiManager.fetch')}
                              </button>
                            )}
                          </div>
                          {entry.fetchError && (
                            <div
                              style={{ fontSize: '11px', color: 'var(--error)', marginTop: '4px' }}
                            >
                              {entry.fetchError}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              updateKey(provider.id, {
                                apiKeys: [],
                                active: false,
                                selectedModel: provider.defaultModels[0] ?? '',
                                availableModels: provider.defaultModels,
                                fetchError: null,
                              });
                              setModelDraft((prev) => {
                                if (!(provider.id in prev)) return prev;
                                const { [provider.id]: _omit, ...rest } = prev;
                                return rest;
                              });
                            }}
                            style={{
                              padding: '7px 14px',
                              background: 'var(--error-bg)',
                              color: 'var(--error)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            {t('apiManager.deleteKey')}
                          </button>
                          <button
                            onClick={() => handleSave(provider.id)}
                            style={{
                              padding: '7px 20px',
                              background: 'var(--accent-primary)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {t('apiManager.save')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  outline: 'none',
  boxSizing: 'border-box',
};

const iconBtnStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--bg-active)',
  color: 'var(--accent-primary)',
  border: '1px solid rgba(129, 140, 248, 0.2)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '12px',
  cursor: 'pointer',
  fontWeight: 600,
};
