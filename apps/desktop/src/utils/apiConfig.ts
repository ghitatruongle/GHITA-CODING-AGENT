import { invoke } from '@tauri-apps/api/core';

export const API_CONFIG_STORAGE_KEY = 'ghita_api_keys';

export type ApiConfigSnapshot = Record<string, Record<string, unknown>>;

function readLegacyLocalStorage(): ApiConfigSnapshot {
  try {
    const raw = localStorage.getItem(API_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ApiConfigSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function loadApiConfig(): Promise<ApiConfigSnapshot> {
  try {
    const config = await invoke<ApiConfigSnapshot>('load_api_config');
    if (config && Object.keys(config).length > 0) return config;

    const legacy = readLegacyLocalStorage();
    if (Object.keys(legacy).length > 0) {
      await saveApiConfig(legacy);
      localStorage.removeItem(API_CONFIG_STORAGE_KEY);
    }
    return legacy;
  } catch {
    return readLegacyLocalStorage();
  }
}

export async function saveApiConfig(config: ApiConfigSnapshot): Promise<void> {
  // Persist to localStorage first so we have a recoverable copy even if the
  // backend invoke fails partway through. Only clear the local copy once the
  // backend has acknowledged the write.
  const serialized = JSON.stringify(config);
  try {
    localStorage.setItem(API_CONFIG_STORAGE_KEY, serialized);
  } catch {
    // localStorage may be full or disabled (private mode). Continue anyway
    // and rely on the backend as the source of truth.
  }

  try {
    await invoke('save_api_config', { config });
    // Backend confirmed — drop the local mirror.
    localStorage.removeItem(API_CONFIG_STORAGE_KEY);
  } catch {
    // Backend write failed. Keep the local copy so the next loadApiConfig
    // call can recover via the legacy fallback path.
    try {
      localStorage.setItem(API_CONFIG_STORAGE_KEY, serialized);
    } catch {
      // Nothing more we can do; the in-memory `config` argument is still
      // valid for the current call site.
    }
  }
}

export function normalizeApiKeys(entry: Record<string, unknown> | null | undefined): string[] {
  if (!entry) return [];
  if (Array.isArray(entry.apiKeys)) return entry.apiKeys.filter(Boolean) as string[];
  if (typeof entry.apiKeys === 'string' && entry.apiKeys) return [entry.apiKeys];
  if (typeof entry.apiKey === 'string' && entry.apiKey) return [entry.apiKey];
  return [];
}
