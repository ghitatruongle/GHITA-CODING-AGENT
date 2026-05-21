// ==============================================================================
// GHITA CODING AGENT — API Manager Component
// ==============================================================================

import { useState, useCallback, useEffect } from 'react';

type ProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';

interface ProviderConfig {
  id: ProviderId;
  name: string;
  icon: string;
  baseUrl: string;
  keyPlaceholder: string;
  defaultModels: string[];
  fetchModelsUrl?: (key: string, baseUrl: string) => string;
  parseModels?: (data: unknown) => string[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🟢',
    baseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini'],
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
  },
  {
    id: 'google',
    name: 'Google Gemini',
    icon: '🔵',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyPlaceholder: 'AIza...',
    defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    fetchModelsUrl: (key, base) => `${base}/v1beta/models?key=${key}`,
    parseModels: (data) => {
      const d = data as { models?: { name: string }[] };
      return (d.models ?? []).map((m) => m.name.replace('models/', '')).sort();
    },
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    icon: '🦙',
    baseUrl: 'http://localhost:11434',
    keyPlaceholder: 'Không cần key',
    defaultModels: ['llama3', 'codellama', 'mistral'],
    fetchModelsUrl: (_key, base) => `${base}/api/tags`,
    parseModels: (data) => {
      const d = data as { models?: { name: string }[] };
      return (d.models ?? []).map((m) => m.name).sort();
    },
  },
  {
    id: 'custom',
    name: 'Custom Provider',
    icon: '⚙️',
    baseUrl: '',
    keyPlaceholder: 'Nhập API key...',
    defaultModels: [],
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

function buildInitialState(): ApiKeysState {
  // Try to restore from localStorage (basic persistence)
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
    // Ignore parse errors
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

export function ApiManager() {
  const [keys, setKeys] = useState<ApiKeysState>(buildInitialState);
  const [expandedId, setExpandedId] = useState<ProviderId | null>(null);
  const [showKey, setShowKey] = useState<ProviderId | null>(null);

  // Persist API keys to localStorage on change
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
    } catch {
      // localStorage may be unavailable
    }
  }, [keys]);

  const updateKey = useCallback((id: ProviderId, patch: Partial<ApiKeyEntry>) => {
    setKeys((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleSave = (id: ProviderId) => {
    const entry = keys[id];
    updateKey(id, { active: entry.apiKey.length > 0 || id === 'ollama' });
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
      if (entry.apiKey && id === 'openai') {
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
    if (key.length <= 8) return '•'.repeat(key.length);
    return key.slice(0, 4) + '•'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  };

  const activeCount = Object.values(keys).filter((k) => k.active).length;

  return (
    <div style={{ padding: '24px', overflow: 'auto', height: '100%' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          marginBottom: '8px',
          background: 'var(--accent-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        API Management
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13px' }}>
        {activeCount > 0
          ? `${activeCount} provider(s) đang hoạt động`
          : 'Thêm API key để bắt đầu sử dụng AI'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {PROVIDERS.map((provider) => {
          const entry = keys[provider.id];
          const isExpanded = expandedId === provider.id;

          return (
            <div
              key={provider.id}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: entry.active
                  ? '1px solid rgba(34, 197, 94, 0.3)'
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
                  padding: '16px 20px',
                  cursor: 'pointer',
                  gap: '12px',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: '24px' }}>{provider.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                    {provider.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {entry.active
                      ? `Model: ${entry.selectedModel || '—'}`
                      : entry.apiKey
                        ? maskKey(entry.apiKey)
                        : provider.keyPlaceholder}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: entry.active ? 'var(--success-bg)' : 'var(--bg-surface)',
                    color: entry.active ? 'var(--success)' : 'var(--text-muted)',
                    border: entry.active ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid var(--border-subtle)',
                  }}
                >
                  {entry.active ? 'Connected' : 'Not set'}
                </span>

                {/* Chevron */}
                <span
                  style={{
                    color: 'var(--text-muted)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms',
                    fontSize: '12px',
                  }}
                >
                  ▼
                </span>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div
                  style={{
                    padding: '0 20px 20px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    paddingTop: '16px',
                  }}
                >
                  {/* API Key input */}
                  <div>
                    <label style={labelStyle}>API Key</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
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
                        title={showKey === provider.id ? 'Hide' : 'Show'}
                      >
                        {showKey === provider.id ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  {/* Base URL (editable for custom) */}
                  {provider.id === 'custom' && (
                    <div>
                      <label style={labelStyle}>Base URL</label>
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
                    <label style={labelStyle}>Model</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        list={`models-list-${provider.id}`}
                        value={entry.selectedModel}
                        onChange={(e) => updateKey(provider.id, { selectedModel: e.target.value })}
                        placeholder="Chọn hoặc tự gõ tên model..."
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <datalist id={`models-list-${provider.id}`}>
                        {entry.availableModels.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>

                      {/* Fetch models button */}
                      {provider.fetchModelsUrl && (
                        <button
                          onClick={() => handleFetchModels(provider.id)}
                          disabled={entry.isFetchingModels || (!entry.apiKey && provider.id !== 'ollama')}
                          style={{
                            ...iconBtnStyle,
                            opacity: entry.isFetchingModels || (!entry.apiKey && provider.id !== 'ollama') ? 0.4 : 1,
                            whiteSpace: 'nowrap',
                          }}
                          title="Lấy danh sách model từ API"
                        >
                          {entry.isFetchingModels ? '⏳' : '🔄'} Fetch
                        </button>
                      )}
                    </div>

                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', display: 'block' }}>
                      💡 Bạn có thể chọn model gợi ý trong danh sách hoặc tự do gõ bất kỳ tên model nào khác.
                    </span>

                    {/* Fetch error */}
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
                          apiKey: '',
                          active: false,
                          selectedModel: provider.defaultModels[0] ?? '',
                          availableModels: provider.defaultModels,
                          fetchError: null,
                        });
                      }}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--error-bg)',
                        color: 'var(--error)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      Xóa Key
                    </button>
                    <button
                      onClick={() => handleSave(provider.id)}
                      style={{
                        padding: '8px 24px',
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Lưu
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '6px',
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
