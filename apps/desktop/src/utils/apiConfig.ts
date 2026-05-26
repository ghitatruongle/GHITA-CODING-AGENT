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
  try {
    await invoke('save_api_config', { config });
    localStorage.removeItem(API_CONFIG_STORAGE_KEY);
  } catch {
    localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }
}
