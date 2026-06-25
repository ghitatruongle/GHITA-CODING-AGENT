import { useEffect, useState, useCallback } from 'react';
import { loadApiConfig, normalizeApiKeys } from '../utils/apiConfig';
import { formatModelLabel as formatModelLabelUtil } from '../utils/modelLabel';
import { type ProviderId, PROVIDER_LABELS } from '../types/providers';

export type { ProviderId, PROVIDER_LABELS };

export interface DynamicModelOption {
  value: string;
  label: string;
  providerId: string;
  model: string;
}

function buildModelOptions(
  parsed: Record<string, Record<string, unknown>> = {},
): DynamicModelOption[] {
  try {
    const options: DynamicModelOption[] = [];
    for (const [id, entry] of Object.entries(parsed)) {
      const pid = id as ProviderId;
      if (!entry || !entry['active']) continue;

      const apiKeys = normalizeApiKeys(entry);

      if (pid !== 'ollama' && pid !== 'opencode-zen' && apiKeys.length === 0) continue;

      const meta = PROVIDER_LABELS[pid] || { name: pid, icon: '🔷' };
      const availableModels = entry['availableModels'] as string[] | undefined;
      const selectedModel = entry['selectedModel'] as string | undefined;
      const models =
        availableModels && availableModels.length > 0
          ? availableModels
          : selectedModel
            ? [selectedModel]
            : [];

      for (const model of models) {
        options.push({
          value: `${pid}/${model}`,
          label: `${meta.icon} ${meta.name} — ${formatModelLabelUtil(pid, model)}`,
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

  const refresh = useCallback(async () => {
    const newOptions = buildModelOptions(await loadApiConfig());
    setModelOptions(newOptions);
    if (newOptions.length > 0 && !newOptions.some((o) => o.value === provider)) {
      setProvider(newOptions[0]?.value ?? '');
    } else if (newOptions.length === 0 && provider) {
      setProvider('');
    }
  }, [provider]);

  // Initial load + refresh when dropdown opens
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Only poll while dropdown is open (reduces unnecessary IPC + re-renders)
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const interval = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [modelDropdownOpen, refresh]);

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
