import { invoke } from '@tauri-apps/api/core';
import { getCurrentSocket } from './sharedSocket';

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

    // One-time migration from the WebView store used by versions <=0.4.9.
    const legacy = readLegacyLocalStorage();
    if (Object.keys(legacy).length > 0) {
      await saveApiConfig(legacy);
      localStorage.removeItem(API_CONFIG_STORAGE_KEY);
    }
    return legacy;
  } catch (error) {
    const legacy = readLegacyLocalStorage();
    if (Object.keys(legacy).length > 0) return legacy;
    throw error;
  }
}

export async function saveApiConfig(config: ApiConfigSnapshot): Promise<void> {
  // API keys must never be mirrored into WebView localStorage. The Rust
  // backend persists this payload in the operating-system credential vault.
  await invoke('save_api_config', { config });
  localStorage.removeItem(API_CONFIG_STORAGE_KEY);
  getCurrentSocket()?.emit('sync_api_config', { config });
}

export function normalizeApiKeys(entry: Record<string, unknown> | null | undefined): string[] {
  if (!entry) return [];
  if (Array.isArray(entry.apiKeys)) return entry.apiKeys.filter(Boolean) as string[];
  if (typeof entry.apiKeys === 'string' && entry.apiKeys) return [entry.apiKeys];
  if (typeof entry.apiKey === 'string' && entry.apiKey) return [entry.apiKey];
  return [];
}
