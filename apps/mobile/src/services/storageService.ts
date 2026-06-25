// ==============================================================================
// GHITA CODING AGENT — AsyncStorage Service
// Persistent storage for mobile app settings & paired devices
// ==============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import type { MobileSettings, PairedDevice } from '../types';
import { DEFAULT_MOBILE_SETTINGS } from '../types';

const KEYCHAIN_SERVICE = 'com.ghita.mobile.auth';

// --- Storage Keys ---
const KEYS = {
  SETTINGS: '@ghita/settings',
  PAIRED_DEVICES: '@ghita/paired_devices',
  LAST_SERVER: '@ghita/last_server',
  DEVICE_ID: '@ghita/device_id',
  AUTH_TOKEN: '@ghita/auth_token',
  TELEMETRY: '@ghita/telemetry',
} as const;

// --- Settings ---

export async function loadSettings(): Promise<MobileSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
    if (raw) {
      return { ...DEFAULT_MOBILE_SETTINGS, ...JSON.parse(raw) } as MobileSettings;
    }
  } catch (error) {
    if (__DEV__) console.warn('[Storage] Failed to load settings:', error);
  }
  return { ...DEFAULT_MOBILE_SETTINGS };
}

export async function saveSettings(settings: MobileSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to save settings:', error);
  }
}

// --- Last Server Address ---

export async function getLastServer(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.LAST_SERVER);
  } catch {
    return null;
  }
}

export async function saveLastServer(address: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.LAST_SERVER, address);
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to save last server:', error);
  }
}

// --- Paired Devices ---

export async function loadPairedDevices(): Promise<PairedDevice[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PAIRED_DEVICES);
    if (raw) {
      return JSON.parse(raw) as PairedDevice[];
    }
  } catch (error) {
    if (__DEV__) console.warn('[Storage] Failed to load paired devices:', error);
  }
  return [];
}

export async function savePairedDevice(device: PairedDevice): Promise<void> {
  try {
    const devices = await loadPairedDevices();
    const existingIndex = devices.findIndex((d) => d.id === device.id);
    if (existingIndex >= 0) {
      devices[existingIndex] = device;
    } else {
      devices.push(device);
    }
    await AsyncStorage.setItem(KEYS.PAIRED_DEVICES, JSON.stringify(devices));
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to save paired device:', error);
  }
}

export async function removePairedDevice(deviceId: string): Promise<void> {
  try {
    const devices = await loadPairedDevices();
    const filtered = devices.filter((d) => d.id !== deviceId);
    await AsyncStorage.setItem(KEYS.PAIRED_DEVICES, JSON.stringify(filtered));
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to remove paired device:', error);
  }
}

// --- Device ID (unique per install) ---

export async function getDeviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(KEYS.DEVICE_ID);
    if (!id) {
      id = `mobile_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      await AsyncStorage.setItem(KEYS.DEVICE_ID, id);
    }
    return id;
  } catch {
    return `mobile_fallback_${Date.now()}`;
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
    });
    return creds ? creds.password : null;
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to get auth token from Keychain:', error);
    return null;
  }
}

export async function saveAuthToken(token: string): Promise<void> {
  try {
    await Keychain.setGenericPassword('auth', token, {
      service: KEYCHAIN_SERVICE,
    });
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to save auth token to Keychain:', error);
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({
      service: KEYCHAIN_SERVICE,
    });
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to clear auth token from Keychain:', error);
  }
}

// --- Telemetry Storage ---

export interface TelemetryRecord {
  tokens: number;
  cost: number;
}

export interface TelemetryDayData {
  day: string;
  tokens: number;
  cost: number;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function saveTelemetry(tokens: number, cost: number): Promise<void> {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

    const raw = await AsyncStorage.getItem(KEYS.TELEMETRY);
    const data: Record<string, TelemetryRecord> = raw ? JSON.parse(raw) : {};

    const existing = data[dateStr] || { tokens: 0, cost: 0 };
    data[dateStr] = {
      tokens: existing.tokens + tokens,
      cost: existing.cost + cost,
    };

    await AsyncStorage.setItem(KEYS.TELEMETRY, JSON.stringify(data));
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to save telemetry:', error);
  }
}

export async function loadTelemetryHistory(): Promise<TelemetryDayData[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.TELEMETRY);
    const data: Record<string, TelemetryRecord> = raw ? JSON.parse(raw) : {};

    const history: TelemetryDayData[] = [];
    const today = new Date();

    // Generate records for the last 7 days (including today) in chronological order
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);
      const dateStr = targetDate.toISOString().split('T')[0];
      const dayName = DAYS_OF_WEEK[targetDate.getDay()];

      const record = data[dateStr] || { tokens: 0, cost: 0 };
      history.push({
        day: dayName,
        tokens: record.tokens,
        cost: record.cost,
      });
    }

    return history;
  } catch (error) {
    if (__DEV__) console.warn('[Storage] Failed to load telemetry history:', error);
    return [];
  }
}

export async function clearTelemetryHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.TELEMETRY);
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to clear telemetry history:', error);
  }
}

// --- Clear All ---

export async function clearAllData(): Promise<void> {
  try {
    const allKeys = Object.values(KEYS).filter((k) => k !== KEYS.AUTH_TOKEN);
    await AsyncStorage.multiRemove(allKeys);
    await clearAuthToken();
  } catch (error) {
    if (__DEV__) console.error('[Storage] Failed to clear all data:', error);
  }
}
