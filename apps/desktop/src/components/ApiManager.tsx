// ==============================================================================
// GHITA CODING AGENT — API Manager (Composition Root)
// State management, config loading, event handlers
// ==============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n';
import { loadApiConfig, saveApiConfig } from '../utils/apiConfig';
import { ProviderList } from './api-manager/ProviderList';
import {
  type ApiKeyEntry,
  type ApiKeysState,
  type ProviderId,
  type ProviderConfig,
  PROVIDERS,
  serializeApiKeysState,
  buildStateFromSnapshot,
  loadFavorites,
  saveFavorites,
} from './api-manager/api-manager-utils';

export function ApiManager() {
  const [keys, setKeys] = useState<ApiKeysState>(() => buildStateFromSnapshot());
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<ProviderId | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<ProviderId>>(loadFavorites);
  const [modelDraft, setModelDraft] = useState<Partial<Record<ProviderId, string>>>({});
  const { t, lang } = useTranslation();

  const getPlaceholder = useCallback(
    (provider: ProviderConfig) => {
      if (provider.id === 'ollama' || provider.id === 'opencode-zen') {
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

  // Load config
  useEffect(() => {
    let cancelled = false;
    loadApiConfig()
      .then((snapshot) => {
        if (!cancelled) setKeys(buildStateFromSnapshot(snapshot));
      })
      .finally(() => {
        if (!cancelled) setIsConfigLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Persist config
  useEffect(() => {
    if (!isConfigLoaded) return;
    try { void saveApiConfig(serializeApiKeysState(keys)); } catch { /* ignore */ }
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

  const handleSave = useCallback((id: ProviderId) => {
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
      [id]: { ...entry, apiKeys, active: apiKeys.length > 0 || needsNoKey },
    };
    if (input) input.value = '';
    setKeys(nextKeys);
    void saveApiConfig(serializeApiKeysState(nextKeys));
    setExpandedId(null);
  }, [keys]);

  const handleFetchModels = useCallback(async (id: ProviderId) => {
    const entry = keys[id];
    const provider = PROVIDERS.find((p) => p.id === id);
    if (!provider?.fetchModelsUrl) return;

    updateKey(id, { isFetchingModels: true, fetchError: null });
    try {
      const activeKey = entry.apiKeys[0] ?? '';
      const url = provider.fetchModelsUrl(activeKey, entry.baseUrl);
      const headers: Record<string, string> = {};
      const openAiCompat = [
        'openai', 'opengateway', 'opencode-zen', 'nvidia-nim', 'mimo', 'openrouter',
        'deepseek', 'groq', 'mistral', 'hicap', 'github-models', 'cerebras', 'together',
        'fireworks', 'cohere', 'xai', 'replicate', 'perplexity', 'voyage', 'ai21',
        'sambanova', 'novita',
      ];
      if (activeKey && openAiCompat.includes(id)) headers['Authorization'] = `Bearer ${activeKey}`;
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
  }, [keys, updateKey]);

  const handleReset = useCallback((id: ProviderId) => {
    updateKey(id, {
      apiKeys: [],
      active: false,
      selectedModel: PROVIDERS.find((p) => p.id === id)?.defaultModels[0] ?? '',
      availableModels: PROVIDERS.find((p) => p.id === id)?.defaultModels ?? [],
      fetchError: null,
    });
    setModelDraft((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  }, [updateKey]);

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
      { label: t('apiManager.favorites'), emoji: '⭐', list: favList },
      { label: t('apiManager.freeLocal'), emoji: '🌟', list: freeList },
      { label: t('apiManager.paid'), emoji: '💰', list: paidList },
      { label: t('apiManager.custom'), emoji: '⚙️', list: customList },
    ].filter((g) => g.list.length > 0);
  }, [filtered, favorites, t]);

  return (
    <div className="p-5 overflow-auto h-full">
      {/* Header */}
      <h2 className="text-lg font-bold mb-1 bg-[var(--accent-gradient)] bg-clip-text text-transparent">
        {t('apiManager.title')}
      </h2>
      <p className="text-[var(--text-muted)] mb-4 text-xs">
        {activeCount > 0
          ? t('apiManager.activeProviders', { count: activeCount })
          : t('apiManager.addKeyHint')}
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50">🔍</span>
        <input
          id="api-provider-search"
          type="text"
          placeholder={t('apiManager.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full py-2.5 pl-9 pr-3 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-md text-[var(--text-primary)] text-[13px] box-border"
        />
      </div>

      {/* Provider List */}
      <ProviderList
        groups={groups}
        keys={keys}
        expandedId={expandedId}
        showKey={showKey}
        favorites={favorites}
        modelDraft={modelDraft}
        getPlaceholder={getPlaceholder}
        onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
        onToggleFavorite={toggleFavorite}
        onToggleShowKey={(keyId) => setShowKey(showKey === keyId ? null : keyId)}
        onRemoveKey={(id, idx) => {
          const entry = keys[id];
          const newKeys = entry.apiKeys.filter((_, i) => i !== idx);
          updateKey(id, {
            apiKeys: newKeys,
            active: newKeys.length > 0 || id === 'ollama' || id === 'opencode-zen',
          });
        }}
        onAddKey={(id) => {
          const entry = keys[id];
          const input = document.getElementById(`new-key-${id}`) as HTMLInputElement;
          const newKey = input?.value?.trim();
          if (newKey && !entry.apiKeys.includes(newKey)) {
            updateKey(id, { apiKeys: [...entry.apiKeys, newKey] });
            if (input) input.value = '';
          }
        }}
        onSave={handleSave}
        onReset={handleReset}
        onModelChange={(id, value) => {
          const provider = PROVIDERS.find((p) => p.id === id);
          setModelDraft((prev) => ({ ...prev, [id]: value }));
          if (provider?.parseModelLabel) {
            updateKey(id, {
              selectedModel: provider.parseModelLabel(value, keys[id].availableModels),
            });
          } else {
            updateKey(id, { selectedModel: value });
          }
        }}
        onModelBlur={(id) => {
          setModelDraft((prev) => {
            if (!(id in prev)) return prev;
            const { [id]: _omit, ...rest } = prev;
            return rest;
          });
        }}
        onFetchModels={handleFetchModels}
        onBaseUrlChange={(id, value) => updateKey(id, { baseUrl: value })}
        onRotationChange={(id, strategy) => updateKey(id, { rotationStrategy: strategy })}
        t={t}
      />
    </div>
  );
}
