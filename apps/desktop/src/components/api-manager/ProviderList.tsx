// ==============================================================================
// GHITA CODING AGENT — Provider List (grouped provider list)
// ==============================================================================

import { type ProviderConfig, type ProviderId } from '../api/providersConfig';
import { type ApiKeyEntry, type KeyRotationStrategy } from './api-manager-utils';
import { ProviderCard } from './ProviderCard';

interface ProviderGroup {
  label: string;
  emoji: string;
  list: ProviderConfig[];
}

interface ProviderListProps {
  groups: ProviderGroup[];
  keys: Record<ProviderId, ApiKeyEntry>;
  expandedId: ProviderId | null;
  showKey: string | null;
  favorites: Set<ProviderId>;
  modelDraft: Partial<Record<ProviderId, string>>;
  getPlaceholder: (provider: ProviderConfig) => string;
  onToggleExpand: (id: ProviderId) => void;
  onToggleFavorite: (id: ProviderId) => void;
  onToggleShowKey: (keyId: string) => void;
  onRemoveKey: (id: ProviderId, index: number) => void;
  onAddKey: (id: ProviderId) => void;
  onSave: (id: ProviderId) => void;
  onReset: (id: ProviderId) => void;
  onModelChange: (id: ProviderId, value: string) => void;
  onModelBlur: (id: ProviderId) => void;
  onFetchModels: (id: ProviderId) => void;
  onBaseUrlChange: (id: ProviderId, value: string) => void;
  onRotationChange: (id: ProviderId, strategy: KeyRotationStrategy) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function ProviderList({
  groups,
  keys,
  expandedId,
  showKey,
  favorites,
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
}: ProviderListProps) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <span>{group.emoji}</span> {group.label}
            <span className="ml-auto text-[10px] font-medium bg-[var(--bg-active)] px-2 py-0.5 rounded-full text-[var(--text-muted)]">
              {group.list.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {group.list.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                entry={keys[provider.id]}
                isExpanded={expandedId === provider.id}
                isFav={favorites.has(provider.id)}
                showKey={showKey}
                modelDraft={modelDraft[provider.id]}
                getPlaceholder={() => getPlaceholder(provider)}
                onToggleExpand={() => onToggleExpand(provider.id)}
                onToggleFavorite={() => onToggleFavorite(provider.id)}
                onToggleShowKey={onToggleShowKey}
                onRemoveKey={(idx) => onRemoveKey(provider.id, idx)}
                onAddKey={() => onAddKey(provider.id)}
                onSave={() => onSave(provider.id)}
                onReset={() => onReset(provider.id)}
                onModelChange={(v) => onModelChange(provider.id, v)}
                onModelBlur={() => onModelBlur(provider.id)}
                onFetchModels={onFetchModels}
                onBaseUrlChange={(v) => onBaseUrlChange(provider.id, v)}
                onRotationChange={(s) => onRotationChange(provider.id, s)}
                t={t}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
