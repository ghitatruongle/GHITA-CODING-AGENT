// ==============================================================================
// GHITA CODING AGENT — API Key Input (multi-key management)
// ==============================================================================

import { type ProviderConfig } from '../api/providersConfig';
import { type ApiKeyEntry, type KeyRotationStrategy } from './api-manager-utils';

const LABEL_STYLE =
  'block text-[11px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wide';
const INPUT_STYLE =
  'w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-sm text-[var(--text-primary)] text-[13px] font-mono box-border';
const ICON_BTN =
  'px-3 py-2 bg-[var(--bg-active)] text-[var(--accent-primary)] border border-indigo-400/20 rounded-sm text-xs cursor-pointer font-semibold';

interface ApiKeyInputProps {
  provider: ProviderConfig;
  entry: ApiKeyEntry;
  showKey: string | null;
  getPlaceholder: () => string;
  onToggleShow: (keyId: string) => void;
  onRemoveKey: (index: number) => void;
  onAddKey: () => void;
  onSave: () => void;
  onRotationChange: (strategy: KeyRotationStrategy) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function ApiKeyInput({
  provider,
  entry,
  showKey,
  getPlaceholder,
  onToggleShow,
  onRemoveKey,
  onAddKey,
  onSave,
  onRotationChange,
  t,
}: ApiKeyInputProps) {
  return (
    <div>
      <label htmlFor={`new-key-${provider.id}`} className={LABEL_STYLE}>
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
        <div key={idx} className="flex gap-1.5 mb-1">
          <input
            type={showKey === `${provider.id}-${idx}` ? 'text' : 'password'}
            value={k}
            readOnly
            className={`${INPUT_STYLE} flex-1 opacity-80`}
          />
          <button
            onClick={() => onToggleShow(`${provider.id}-${idx}`)}
            className={ICON_BTN}
            title={
              showKey === `${provider.id}-${idx}` ? t('apiManager.hide') : t('apiManager.show')
            }
          >
            {showKey === `${provider.id}-${idx}` ? '🙈' : '👁️'}
          </button>
          <button
            onClick={() => onRemoveKey(idx)}
            className={`${ICON_BTN} !text-[var(--error)]`}
            title={t('apiManager.removeKey')}
          >
            ❌
          </button>
        </div>
      ))}

      {/* Add new key input */}
      <div className="flex gap-1.5 mt-1">
        <input
          type={showKey === `${provider.id}-new` ? 'text' : 'password'}
          defaultValue=""
          placeholder={getPlaceholder()}
          id={`new-key-${provider.id}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
          }}
          className={`${INPUT_STYLE} flex-1`}
        />
        <button onClick={() => onToggleShow(`${provider.id}-new`)} className={ICON_BTN}>
          {showKey === `${provider.id}-new` ? '🙈' : '👁️'}
        </button>
        <button onClick={onAddKey} className={ICON_BTN} title={t('apiManager.addKey')}>
          ➕
        </button>
      </div>

      {/* Rotation strategy selector */}
      {entry.apiKeys.length > 1 && (
        <div className="mt-2">
          <label className={LABEL_STYLE} htmlFor={`rotation-strategy-${entry.providerId}`}>
            {t('apiManager.keyStrategy')}
          </label>
          <select
            id={`rotation-strategy-${entry.providerId}`}
            value={entry.rotationStrategy}
            onChange={(e) => onRotationChange(e.target.value as KeyRotationStrategy)}
            className={INPUT_STYLE}
          >
            <option value="failover">{t('apiManager.strategyFailover')}</option>
            <option value="round-robin">{t('apiManager.strategyRoundRobin')}</option>
            <option value="random">{t('apiManager.strategyRandom')}</option>
          </select>
        </div>
      )}
    </div>
  );
}
