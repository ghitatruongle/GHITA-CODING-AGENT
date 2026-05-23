// ==============================================================================
// GHITA CODING AGENT — API Manager Component (v2 Redesign)
// Searchable, categorized, favorites, status badges
// ==============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n';

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
  | 'github-models';

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
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'opengateway',
    name: 'Gitlawb Opengateway',
    icon: '🌐',
    baseUrl: 'https://opengateway.gitlawb.com/v1',
    keyPlaceholder: 'Miễn phí — không cần key',
    defaultModels: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-pro', 'mimo-v2-omni', 'mimo-v2-flash'],
    category: 'free',
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
    defaultModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
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
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🔀',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-...',
    defaultModels: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'meta-llama/llama-3.1-70b-instruct'],
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

interface ApiKeyEntry {
  providerId: ProviderId;
  apiKey: string;
  baseUrl: string;
  selectedModel: string;
  active: boolean;
  availableModels: string[];
  isFetchingModels: boolean;
  fetchError: string | null;
}

type ApiKeysState = Record<ProviderId, ApiKeyEntry>;

const STORAGE_KEY = 'ghita_api_keys';
const FAVORITES_KEY = 'ghita_api_favorites';

function buildInitialState(): ApiKeysState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Record<ProviderId, Partial<ApiKeyEntry>>>;
      const state = {} as ApiKeysState;
      for (const p of PROVIDERS) {
        const savedEntry = parsed[p.id];
        state[p.id] = {
          providerId: p.id,
          apiKey: savedEntry?.apiKey ?? '',
          baseUrl: savedEntry?.baseUrl ?? p.baseUrl,
          selectedModel: savedEntry?.selectedModel ?? p.defaultModels[0] ?? '',
          active: savedEntry?.active ?? false,
          availableModels: savedEntry?.availableModels ?? p.defaultModels,
          isFetchingModels: false,
          fetchError: null,
        };
      }
      return state;
    }
  } catch {
    // Ignore
  }

  const state = {} as ApiKeysState;
  for (const p of PROVIDERS) {
    state[p.id] = {
      providerId: p.id,
      apiKey: '',
      baseUrl: p.baseUrl,
      selectedModel: p.defaultModels[0] ?? '',
      active: false,
      availableModels: p.defaultModels,
      isFetchingModels: false,
      fetchError: null,
    };
  }
  return state;
}

function loadFavorites(): Set<ProviderId> {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) return new Set(JSON.parse(saved) as ProviderId[]);
  } catch { /* ignore */ }
  return new Set<ProviderId>();
}

function saveFavorites(favs: Set<ProviderId>) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs])); } catch { /* ignore */ }
}

export function ApiManager() {
  const [keys, setKeys] = useState<ApiKeysState>(buildInitialState);
  const [expandedId, setExpandedId] = useState<ProviderId | null>(null);
  const [showKey, setShowKey] = useState<ProviderId | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<ProviderId>>(loadFavorites);
  const { t } = useTranslation();

  // Persist API keys
  useEffect(() => {
    try {
      const toSave: Partial<Record<ProviderId, Partial<ApiKeyEntry>>> = {};
      for (const [id, entry] of Object.entries(keys)) {
        toSave[id as ProviderId] = {
          apiKey: entry.apiKey,
          baseUrl: entry.baseUrl,
          selectedModel: entry.selectedModel,
          active: entry.active,
          availableModels: entry.availableModels,
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  }, [keys]);

  const updateKey = useCallback((id: ProviderId, patch: Partial<ApiKeyEntry>) => {
    setKeys((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const toggleFavorite = useCallback((id: ProviderId) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleSave = (id: ProviderId) => {
    const entry = keys[id];
    const needsNoKey = id === 'ollama' || id === 'opengateway';
    updateKey(id, { active: entry.apiKey.length > 0 || needsNoKey });
    setExpandedId(null);
  };

  const handleFetchModels = async (id: ProviderId) => {
    const entry = keys[id];
    const provider = PROVIDERS.find((p) => p.id === id);
    if (!provider?.fetchModelsUrl) return;

    updateKey(id, { isFetchingModels: true, fetchError: null });

    try {
      const url = provider.fetchModelsUrl(entry.apiKey, entry.baseUrl);
      const headers: Record<string, string> = {};
      const openAiCompat = ['openai', 'opengateway', 'mimo', 'openrouter', 'deepseek', 'groq', 'mistral', 'hicap', 'github-models'];
      if (entry.apiKey && openAiCompat.includes(id)) {
        headers['Authorization'] = `Bearer ${entry.apiKey}`;
      }
      if (entry.apiKey && id === 'anthropic') {
        headers['x-api-key'] = entry.apiKey;
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
    return PROVIDERS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.includes(q),
    );
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
      <h2 style={{
        fontSize: '18px', fontWeight: 700, marginBottom: '4px',
        background: 'var(--accent-gradient)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>
        {t('apiManager.title')}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '12px' }}>
        {activeCount > 0 ? t('apiManager.activeProviders', { count: activeCount }) : t('apiManager.addKeyHint')}
      </p>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', opacity: 0.5 }}>
          🔍
        </span>
        <input
          type="text"
          placeholder={t('apiManager.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px 10px 36px',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
            fontSize: '13px', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {groups.map((group) => (
          <div key={group.label}>
            <div style={{
              fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span>{group.emoji}</span> {group.label}
              <span style={{
                marginLeft: 'auto', fontSize: '10px', fontWeight: 500,
                background: 'var(--bg-active)', padding: '2px 8px',
                borderRadius: 'var(--radius-full)', color: 'var(--text-muted)',
              }}>
                {group.list.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {group.list.map((provider) => {
                const entry = keys[provider.id];
                const isExpanded = expandedId === provider.id;
                const isFav = favorites.has(provider.id);
                const status = entry.active ? 'active' : entry.apiKey ? 'ready' : 'none';

                return (
                  <div
                    key={provider.id}
                    style={{
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: status === 'active'
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
                        display: 'flex', alignItems: 'center',
                        padding: '12px 16px', cursor: 'pointer', gap: '10px',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Favorite star */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(provider.id); }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '14px', padding: '2px', opacity: isFav ? 1 : 0.3,
                          transition: 'opacity 0.2s',
                        }}
                        title={isFav ? t('apiManager.removeFavorite') : t('apiManager.addFavorite')}
                      >
                        {isFav ? '\u2B50' : '\u2606'}
                      </button>

                      <span style={{ fontSize: '20px' }}>{provider.icon}</span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {provider.name}
                        </div>
                        <div style={{
                          fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {status === 'active'
                            ? `${t('apiManager.model')}: ${entry.selectedModel || '\u2014'}`
                            : status === 'ready'
                              ? maskKey(entry.apiKey)
                              : provider.keyPlaceholder}
                        </div>
                      </div>

                      {/* Status badge */}
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        fontSize: '10px', fontWeight: 600,
                        background: status === 'active'
                          ? 'var(--success-bg)'
                          : status === 'ready'
                            ? 'rgba(245, 158, 11, 0.1)'
                            : 'var(--bg-surface)',
                        color: status === 'active'
                          ? 'var(--success)'
                          : status === 'ready'
                            ? '#f59e0b'
                            : 'var(--text-muted)',
                        border: status === 'active'
                          ? '1px solid rgba(34, 197, 94, 0.3)'
                          : status === 'ready'
                            ? '1px solid rgba(245, 158, 11, 0.2)'
                            : '1px solid var(--border-subtle)',
                        whiteSpace: 'nowrap',
                      }}>
                        {status === 'active' ? t('apiManager.active') : status === 'ready' ? t('apiManager.ready') : t('apiManager.notSet')}
                      </span>

                      {/* Chevron */}
                      <span style={{
                        color: 'var(--text-muted)',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms', fontSize: '10px',
                      }}>
                        ▼
                      </span>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{
                        padding: '0 16px 16px',
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '14px',
                      }}>
                        {/* API Key input */}
                        <div>
                          <label style={labelStyle}>API Key</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type={showKey === provider.id ? 'text' : 'password'}
                              value={entry.apiKey}
                              onChange={(e) => updateKey(provider.id, { apiKey: e.target.value, active: false })}
                              placeholder={provider.keyPlaceholder}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <button
                              onClick={() => setShowKey(showKey === provider.id ? null : provider.id)}
                              style={iconBtnStyle}
                              title={showKey === provider.id ? t('apiManager.hide') : t('apiManager.show')}
                            >
                              {showKey === provider.id ? '\uD83D\uDE48' : '\uD83D\uDC41\uFE0F'}
                            </button>
                          </div>
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
                              value={entry.selectedModel}
                              onChange={(e) => updateKey(provider.id, { selectedModel: e.target.value })}
                              placeholder={t('apiManager.selectModel')}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <datalist id={`models-list-${provider.id}`}>
                              {entry.availableModels.map((m) => (
                                <option key={m} value={m} />
                              ))}
                            </datalist>

                            {provider.fetchModelsUrl && (
                              <button
                                onClick={() => handleFetchModels(provider.id)}
                                disabled={entry.isFetchingModels || (!entry.apiKey && provider.id !== 'ollama' && provider.id !== 'opengateway')}
                                style={{
                                  ...iconBtnStyle,
                                  opacity: entry.isFetchingModels || (!entry.apiKey && provider.id !== 'ollama' && provider.id !== 'opengateway') ? 0.4 : 1,
                                  whiteSpace: 'nowrap',
                                }}
                                title={t('apiManager.fetchModels')}
                              >
                                {entry.isFetchingModels ? '\u23F3' : '\uD83D\uDD04'} {t('apiManager.fetch')}
                              </button>
                            )}
                          </div>
                          {entry.fetchError && (
                            <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '4px' }}>
                              {entry.fetchError}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              updateKey(provider.id, {
                                apiKey: '', active: false,
                                selectedModel: provider.defaultModels[0] ?? '',
                                availableModels: provider.defaultModels,
                                fetchError: null,
                              });
                            }}
                            style={{
                              padding: '7px 14px', background: 'var(--error-bg)',
                              color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.2)',
                              borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer',
                            }}
                          >
                            {t('apiManager.deleteKey')}
                          </button>
                          <button
                            onClick={() => handleSave(provider.id)}
                            style={{
                              padding: '7px 20px', background: 'var(--accent-primary)',
                              color: '#fff', border: 'none',
                              borderRadius: 'var(--radius-sm)', fontSize: '12px',
                              fontWeight: 600, cursor: 'pointer',
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
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: '5px',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  fontSize: '13px', fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  outline: 'none', boxSizing: 'border-box',
};

const iconBtnStyle: React.CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-active)',
  color: 'var(--accent-primary)', border: '1px solid rgba(129, 140, 248, 0.2)',
  borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
};
