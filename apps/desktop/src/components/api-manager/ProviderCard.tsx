// ==============================================================================
// GHITA CODING AGENT — Provider Card (expandable card for a single provider)
// ==============================================================================

import { type ProviderConfig } from '../api/providersConfig';
import { type ApiKeyEntry, type KeyRotationStrategy, type ProviderId, maskKey } from './api-manager-utils';
import { ApiKeyInput } from './ApiKeyInput';
import { ModelSelector } from './ModelSelector';

const LABEL_STYLE =
  'block text-[11px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wide';
const INPUT_STYLE =
  'w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-sm text-[var(--text-primary)] text-[13px] font-mono box-border';

interface ProviderCardProps {
  provider: ProviderConfig;
  entry: ApiKeyEntry;
  isExpanded: boolean;
  isFav: boolean;
  showKey: string | null;
  modelDraft: string | undefined;
  getPlaceholder: () => string;
  onToggleExpand: () => void;
  onToggleFavorite: () => void;
  onToggleShowKey: (keyId: string) => void;
  onRemoveKey: (index: number) => void;
  onAddKey: () => void;
  onSave: () => void;
  onReset: () => void;
  onModelChange: (value: string) => void;
  onModelBlur: () => void;
  onFetchModels: (id: ProviderId) => void;
  onBaseUrlChange: (value: string) => void;
  onRotationChange: (strategy: KeyRotationStrategy) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function ProviderCard({
  provider,
  entry,
  isExpanded,
  isFav,
  showKey,
  modelDraft,
  getPlaceholder,
  onToggleExpand,
  onToggleFavorite,
  onToggleShowKey,
  onRemoveKey,
  onAddKey,
  onSave,
  onReset,
  onModelChange,
  onModelBlur,
  onFetchModels,
  onBaseUrlChange,
  onRotationChange,
  t,
}: ProviderCardProps) {
  const status = entry.active
    ? 'active'
    : entry.apiKeys.length > 0
      ? 'ready'
      : 'none';

  const borderClass =
    status === 'active'
      ? 'border-emerald-500/30'
      : status === 'ready'
        ? 'border-amber-500/20'
        : 'border-[var(--border-subtle)]';

  const badgeClass =
    status === 'active'
      ? 'bg-[var(--success-bg)] text-[var(--success)] border border-emerald-500/30'
      : status === 'ready'
        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
        : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]';

  return (
    <div className={`bg-[var(--bg-surface)] rounded-md border overflow-hidden transition-colors ${borderClass}`}>
      {/* Header row */}
      <div
        className="focus-ring flex items-center px-4 py-3 cursor-pointer gap-2.5 transition-colors hover:bg-[var(--bg-hover)]"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={`provider-content-${provider.id}`}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        {/* Favorite star */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`bg-none border-none cursor-pointer text-sm p-0.5 transition-opacity ${isFav ? 'opacity-100' : 'opacity-30'}`}
          title={isFav ? t('apiManager.removeFavorite') : t('apiManager.addFavorite')}
        >
          {isFav ? '⭐' : '☆'}
        </button>

        <span className="text-xl">{provider.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[var(--text-primary)] text-[13px]">{provider.name}</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-px overflow-hidden text-ellipsis whitespace-nowrap">
            {status === 'active'
              ? `${t('apiManager.model')}: ${(provider.formatModelLabel ? provider.formatModelLabel(entry.selectedModel) : entry.selectedModel) || '—'}`
              : status === 'ready'
                ? maskKey(entry.apiKeys[0] ?? '')
                : getPlaceholder()}
          </div>
        </div>

        {/* Status badge */}
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${badgeClass}`}>
          {status === 'active'
            ? t('apiManager.active')
            : status === 'ready'
              ? t('apiManager.ready')
              : t('apiManager.notSet')}
        </span>

        {/* Chevron */}
        <span
          className="text-[var(--text-muted)] text-[10px] transition-transform duration-200"
          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▼
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div
          id={`provider-content-${provider.id}`}
          className="px-4 pb-4 border-t border-[var(--border-subtle)] flex flex-col gap-3 pt-3.5"
        >
          <ApiKeyInput
            provider={provider}
            entry={entry}
            showKey={showKey}
            getPlaceholder={getPlaceholder}
            onToggleShow={onToggleShowKey}
            onRemoveKey={onRemoveKey}
            onAddKey={onAddKey}
            onSave={onSave}
            onRotationChange={onRotationChange}
            t={t}
          />

          {/* Base URL (editable for custom) */}
          {provider.id === 'custom' && (
            <div>
              <label htmlFor={`base-url-${provider.id}`} className={LABEL_STYLE}>
                {t('apiManager.baseUrl')}
              </label>
              <input
                id={`base-url-${provider.id}`}
                type="text"
                value={entry.baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder="https://api.example.com/v1"
                className={INPUT_STYLE}
              />
            </div>
          )}

          <ModelSelector
            provider={provider}
            entry={entry}
            modelDraft={modelDraft}
            onModelChange={onModelChange}
            onBlur={onModelBlur}
            onFetchModels={onFetchModels}
            t={t}
          />

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onReset}
              className="px-3.5 py-1.5 bg-[var(--error-bg)] text-[var(--error)] border border-red-500/20 rounded-sm text-xs cursor-pointer"
            >
              {t('apiManager.deleteKey')}
            </button>
            <button
              onClick={onSave}
              className="px-5 py-1.5 bg-[var(--accent-primary)] text-white border-none rounded-sm text-xs font-semibold cursor-pointer"
            >
              {t('apiManager.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
