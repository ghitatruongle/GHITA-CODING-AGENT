import { normalizeApiKeys } from '../../utils/apiConfig';
import { type ProviderId, type ProviderConfig, PROVIDERS } from '../api/providersConfig';

export type KeyRotationStrategy = 'round-robin' | 'failover' | 'random';

export interface ApiKeyEntry {
  providerId: ProviderId;
  apiKeys: string[];
  baseUrl: string;
  selectedModel: string;
  active: boolean;
  availableModels: string[];
  isFetchingModels: boolean;
  fetchError: string | null;
  rotationStrategy: KeyRotationStrategy;
}

export type ApiKeysState = Record<ProviderId, ApiKeyEntry>;

export const FAVORITES_KEY = 'ghita_api_favorites';

export function serializeApiKeysState(
  keys: ApiKeysState,
): Record<string, Record<string, unknown>> {
  const toSave: Record<string, Record<string, unknown>> = {};
  for (const [id, entry] of Object.entries(keys)) {
    toSave[id] = {
      apiKeys: entry.apiKeys,
      baseUrl: entry.baseUrl,
      selectedModel: entry.selectedModel,
      active: entry.active,
      availableModels: entry.availableModels,
      rotationStrategy: entry.rotationStrategy,
    };
  }
  return toSave;
}

export function buildStateFromSnapshot(
  snapshot: Record<string, Record<string, unknown>> = {},
): ApiKeysState {
  const state = {} as ApiKeysState;
  for (const p of PROVIDERS) {
    const savedEntry = snapshot[p.id];
    let apiKeys: string[] = [];
    if (savedEntry) {
      apiKeys = normalizeApiKeys(savedEntry);
    }
    state[p.id] = {
      providerId: p.id,
      apiKeys,
      baseUrl: (savedEntry?.['baseUrl'] as string) ?? p.baseUrl,
      selectedModel: (savedEntry?.['selectedModel'] as string) ?? p.defaultModels[0] ?? '',
      active: (savedEntry?.['active'] as boolean) ?? false,
      availableModels: (savedEntry?.['availableModels'] as string[]) ?? p.defaultModels,
      isFetchingModels: false,
      fetchError: null,
      rotationStrategy: (savedEntry?.['rotationStrategy'] as KeyRotationStrategy) ?? 'failover',
    };
  }
  return state;
}

export function loadFavorites(): Set<ProviderId> {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) return new Set(JSON.parse(saved) as ProviderId[]);
  } catch {
    /* ignore */
  }
  return new Set<ProviderId>();
}

export function saveFavorites(favs: Set<ProviderId>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
  } catch {
    /* ignore */
  }
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '\u2022'.repeat(key.length);
  return key.slice(0, 4) + '\u2022'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
}

// Re-export for convenience
export { type ProviderId, type ProviderConfig, PROVIDERS };
