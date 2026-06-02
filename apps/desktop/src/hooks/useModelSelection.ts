import { useEffect, useState } from 'react';
import { loadApiConfig } from '../utils/apiConfig';

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
  | 'novita';

export const PROVIDER_LABELS: Record<ProviderId, { name: string; icon: string }> = {
  openai:          { name: 'OpenAI',                icon: '🟢' },
  anthropic:       { name: 'Anthropic',             icon: '🟣' },
  google:          { name: 'Google Gemini',         icon: '🔵' },
  ollama:          { name: 'Ollama (Local)',         icon: '🦙' },
  custom:          { name: 'Custom Provider',       icon: '⚙️' },
  opengateway:     { name: 'Gitlawb Opengateway',   icon: '🌐' },
  mimo:            { name: 'Xiaomi MiMo',           icon: '🤖' },
  openrouter:      { name: 'OpenRouter',            icon: '🔀' },
  deepseek:        { name: 'DeepSeek',              icon: '🔍' },
  groq:            { name: 'Groq',                  icon: '⚡' },
  mistral:         { name: 'Mistral',               icon: '🌊' },
  hicap:           { name: 'Hicap',                 icon: '🔗' },
  'github-models': { name: 'GitHub Models',         icon: '🐙' },
  cerebras:        { name: 'Cerebras',              icon: '⚡' },
  together:        { name: 'Together AI',           icon: '🤝' },
  fireworks:       { name: 'Fireworks AI',          icon: '🎆' },
  cohere:          { name: 'Cohere',                icon: '🔷' },
  xai:             { name: 'xAI (Grok)',            icon: '❌' },
  replicate:       { name: 'Replicate',             icon: '🔁' },
  perplexity:      { name: 'Perplexity',            icon: '🔎' },
  voyage:          { name: 'Voyage AI',             icon: '🧭' },
  ai21:            { name: 'AI21 Labs',             icon: '🧪' },
  sambanova:       { name: 'SambaNova',             icon: '🔥' },
  novita:          { name: 'Novita AI',             icon: '🌟' },
};

export interface DynamicModelOption {
  value: string;
  label: string;
  providerId: string;
  model: string;
}

function buildModelOptions(parsed: Record<string, Record<string, unknown>> = {}): DynamicModelOption[] {
  try {
    const options: DynamicModelOption[] = [];
    for (const [id, entry] of Object.entries(parsed)) {
      const pid = id as ProviderId;
      if (!entry || !entry['active']) continue;

      const apiKeys = Array.isArray(entry['apiKeys'])
        ? (entry['apiKeys'] as string[])
        : typeof entry['apiKey'] === 'string' && entry['apiKey']
          ? [entry['apiKey'] as string]
          : [];

      if (pid !== 'ollama' && pid !== 'opengateway' && apiKeys.length === 0) continue;

      const meta = PROVIDER_LABELS[pid] || { name: pid, icon: '🔷' };
      const availableModels = entry['availableModels'] as string[] | undefined;
      const selectedModel = entry['selectedModel'] as string | undefined;
      const models = availableModels && availableModels.length > 0
        ? availableModels
        : selectedModel
          ? [selectedModel]
          : [];

      for (const model of models) {
        options.push({
          value: `${pid}/${model}`,
          label: `${meta.icon} ${meta.name} — ${model}`,
          providerId: pid,
          model,
        });
      }
    }
    return options;
  } catch {
    return [];
  }
}

export function useModelSelection() {
  const [modelOptions, setModelOptions] = useState<DynamicModelOption[]>([]);
  const [provider, setProvider] = useState<string>('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-model-dropdown]')) {
        setModelDropdownOpen(false);
        setModelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelDropdownOpen]);

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const newOptions = buildModelOptions(await loadApiConfig());
      if (disposed) return;
      setModelOptions(newOptions);
      if (newOptions.length > 0 && !newOptions.some((o) => o.value === provider)) {
        setProvider(newOptions[0]?.value ?? '');
      } else if (newOptions.length === 0 && provider) {
        setProvider('');
      }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 30000);
    return () => { disposed = true; clearInterval(interval); };
  }, [provider]);

  const selectedProviderId = (() => {
    const slashIdx = provider.indexOf('/');
    return slashIdx > 0 ? provider.substring(0, slashIdx) : provider;
  })();

  const selectedModel = (() => {
    const slashIdx = provider.indexOf('/');
    return slashIdx > 0 ? provider.substring(slashIdx + 1) : undefined;
  })();

  return {
    modelOptions,
    provider,
    setProvider,
    modelDropdownOpen,
    setModelDropdownOpen,
    modelSearch,
    setModelSearch,
    selectedProviderId,
    selectedModel,
  };
}
