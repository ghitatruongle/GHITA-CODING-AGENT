// ==============================================================================
// GHITA CODING AGENT - Shared Utilities
// ==============================================================================

import type { Platform } from './types.js';

// --- Platform Detection ---

/**
 * Detect the current platform using Tauri v2 API if available.
 * Falls back to user-agent or process.platform detection.
 */
export function getPlatform(): Platform {
  // React Native (mobile)
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent?.toLowerCase() ?? '';
      if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
    }
    return 'android';
  }
  // Tauri v2 — check for __TAURI_INTERNALS__ (available even without withGlobalTauri)
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    // Tauri always runs natively — detect via user-agent or platform API
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent?.toLowerCase() ?? '';
      if (ua.includes('windows') || ua.includes('win32')) return 'windows';
      if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
      if (ua.includes('linux')) return 'linux';
    }
  }
  // Tauri v1 (withGlobalTauri: true) — legacy __TAURI__ global
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const tauriWindow = window as Record<string, unknown>;
    const tauri = tauriWindow['__TAURI__'] as Record<string, unknown> | undefined;
    if (tauri) {
      const os = tauri['os'] as Record<string, unknown> | undefined;
      if (os && typeof os === 'object' && 'platform' in os) {
        const platform = os['platform'];
        if (platform === 'win32') return 'windows';
        if (platform === 'darwin') return 'macos';
        return 'linux';
      }
    }
  }
  // Browser / WebView (fallback for mobile)
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent?.toLowerCase() ?? '';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
    if (ua.includes('android')) return 'android';
    if (ua.includes('windows') || ua.includes('win32')) return 'windows';
    if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
    if (ua.includes('linux')) return 'linux';
  }
  // Node.js
  if (typeof process !== 'undefined' && process.platform) {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'macos';
    if (process.platform === 'linux') return 'linux';
  }
  return 'linux'; // fallback
}

export function isDesktop(): boolean {
  const p = getPlatform();
  return p === 'windows' || p === 'linux' || p === 'macos';
}

export function isMobile(): boolean {
  const p = getPlatform();
  return p === 'android' || p === 'ios';
}

export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

// --- ID Generation ---

/** Generate a UUID v4 string with fallback for non-secure contexts */
export function generateUUID(): string {
  // Try Web Crypto API first (secure context, Node, Tauri)
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    try {
      const result = (globalThis.crypto as unknown as { randomUUID?: () => string }).randomUUID?.();
      if (result) return result;
    } catch {
      // fall through
    }
  }
  // Fallback: Math.random-based UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 for clarity
  let code = '';

  // Try using Web Crypto API if available (Node >= 19, Browser, Tauri)
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    try {
      const buffer = new Uint8Array(6);
      globalThis.crypto.getRandomValues(buffer);
      for (let i = 0; i < 6; i++) {
        const val = buffer[i];
        if (val !== undefined) {
          code += chars.charAt(val % chars.length);
        }
      }
      return code;
    } catch {
      // fall through to Math.random fallback
    }
  }

  // Fallback: Math.random
  for (let i = 0; i < 6; i++) {
    const randIndex = Math.floor(Math.random() * chars.length);
    code += chars.charAt(randIndex);
  }
  return code;
}

// --- String Helpers ---
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...`;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// --- Number Helpers ---
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Array Helpers ---
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const key = keyFn(item);
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    },
    {} as Record<string, T[]>,
  );
}

// --- Object Helpers ---
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

// --- Async Helpers ---
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1000): Promise<T> {
  if (maxAttempts < 1) {
    throw new Error('maxAttempts must be at least 1');
  }
  if (delayMs < 0) {
    throw new Error('delayMs must be non-negative');
  }
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt); // exponential backoff
      }
    }
  }
  throw lastError;
}

// --- Validation ---
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidApiKey(key: string): boolean {
  return typeof key === 'string' && key.length >= 8 && !key.includes(' ');
}

// --- Date Helpers ---
export function formatDate(date: Date | number): string {
  const d = new Date(date);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
