// Shared helper that flattens persisted API config into a flat dropdown list.
// Extracted from ChatPanel.tsx to allow reuse and unit testing.

import { loadApiConfig, normalizeApiKeys } from './apiConfig';
import { formatModelLabel } from './modelLabel';
import { type ProviderId, PROVIDER_LABELS } from '../types/providers';

export interface DynamicModelOption {
  value: string; // e.g. 'openai/gpt-4o'
  label: string; // e.g. '🟢 OpenAI — gpt-4o'
  providerId: string; // e.g. 'openai'
  model: string; // e.g. 'gpt-4o'
}

/** Build flat model option list from persisted API config. */
export function buildModelOptions(
  parsed: Record<string, Record<string, unknown>> = {},
): DynamicModelOption[] {
  try {
    const options: DynamicModelOption[] = [];

    for (const [id, entry] of Object.entries(parsed)) {
      const pid = id as ProviderId;
      if (!entry) continue;

      // Provider must be active
      if (!entry['active']) continue;

      const apiKeys = normalizeApiKeys(entry);

      // Non-ollama/opencode-zen providers must have a non-empty API key
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
        const displayModel = formatModelLabel(pid, model);
        options.push({
          value: `${pid}/${model}`,
          label: `${meta.icon} ${meta.name} — ${displayModel}`,
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

/** Convenience wrapper: load config from disk then build options. */
export async function loadModelOptions(): Promise<DynamicModelOption[]> {
  return buildModelOptions(await loadApiConfig());
}
