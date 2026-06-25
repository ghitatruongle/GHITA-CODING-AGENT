// ==============================================================================
// GHITA CODING AGENT — Model Selector (input + datalist + fetch button)
// ==============================================================================

import { type ProviderConfig } from '../api/providersConfig';
import { type ApiKeyEntry, type ProviderId } from './api-manager-utils';

const LABEL_STYLE =
  'block text-[11px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wide';
const INPUT_STYLE =
  'w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-sm text-[var(--text-primary)] text-[13px] font-mono box-border';
const ICON_BTN =
  'px-3 py-2 bg-[var(--bg-active)] text-[var(--accent-primary)] border border-indigo-400/20 rounded-sm text-xs cursor-pointer font-semibold disabled:opacity-40';

interface ModelSelectorProps {
  provider: ProviderConfig;
  entry: ApiKeyEntry;
  modelDraft: string | undefined;
  onModelChange: (value: string) => void;
  onBlur: () => void;
  onFetchModels: (id: ProviderId) => void;
  t: (key: string) => string;
}

export function ModelSelector({
  provider,
  entry,
  modelDraft,
  onModelChange,
  onBlur,
  onFetchModels,
  t,
}: ModelSelectorProps) {
  const displayValue =
    modelDraft ??
    (provider.formatModelLabel
      ? provider.formatModelLabel(entry.selectedModel)
      : entry.selectedModel);

  const canFetch =
    !entry.isFetchingModels &&
    (entry.apiKeys.length > 0 ||
      provider.id === 'ollama' ||
      provider.id === 'opencode-zen');

  return (
    <div>
      <label htmlFor={`model-select-${provider.id}`} className={LABEL_STYLE}>
        {t('apiManager.model')}
      </label>
      <div className="flex gap-1.5 items-center">
        <input
          id={`model-select-${provider.id}`}
          type="text"
          list={`models-list-${provider.id}`}
          value={displayValue}
          onChange={(e) => onModelChange(e.target.value)}
          onBlur={onBlur}
          placeholder={t('apiManager.selectModel')}
          className={`${INPUT_STYLE} flex-1`}
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
            onClick={() => onFetchModels(provider.id)}
            disabled={!canFetch}
            className={ICON_BTN}
            title={t('apiManager.fetchModels')}
          >
            {entry.isFetchingModels ? '⏳' : '🔄'} {t('apiManager.fetch')}
          </button>
        )}
      </div>
      {entry.fetchError && (
        <div className="text-[11px] text-[var(--error)] mt-1">{entry.fetchError}</div>
      )}
    </div>
  );
}
