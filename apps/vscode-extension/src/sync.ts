// Pure functions extracted from extension.ts so they can be unit-tested
// without booting the VS Code runtime.

// Types

export interface SyncConfig {
  corePort: number;
  autoSync: boolean;
  debounceMs: number;
  maxRetries: number;
  reconnectDelayMs: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  corePort: 8080,
  autoSync: true,
  debounceMs: 300,
  maxRetries: 20,
  reconnectDelayMs: 2000,
};

export interface FileChangePayload {
  filePath: string;
  content: string;
  languageId: string;
  timestamp: number;
  syncId: string;
}

export interface FileDeletePayload {
  filePath: string;
  timestamp: number;
  syncId: string;
}

export interface FileRenamePayload {
  oldPath: string;
  newPath: string;
  timestamp: number;
  syncId: string;
}

export interface WorkspaceSyncPayload {
  syncId: string;
  workspaceRoot: string;
  fileCount: number;
  files: Array<{
    path: string;
    languageId: string;
    sizeBytes: number;
    lastModified: number;
  }>;
  timestamp: number;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

export interface SyncStats {
  filesSent: number;
  filesReceived: number;
  syncErrors: number;
  lastSyncAt: number;
  totalBytesSent: number;
}

// ID generation

/**
 * Generates a short, time-sortable ID for sync events.
 * Format: `<base36-millis>_<4-char-random>`
 */
export function generateSyncId(now: number = Date.now(), rand: number = Math.random()): string {
  return `${now.toString(36)}_${rand.toString(36).substring(2).padEnd(8, '0').slice(0, 8)}`;
}

// Config

/**
 * Merges user-provided settings with defaults. Unknown keys are dropped,
 * missing keys fall back to the default value.
 */
export function mergeConfig(input: Partial<SyncConfig> | undefined | null): SyncConfig {
  const base: SyncConfig = { ...DEFAULT_SYNC_CONFIG };
  if (!input) return base;
  for (const key of Object.keys(DEFAULT_SYNC_CONFIG) as Array<keyof SyncConfig>) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== typeof base[key]) continue;
    base[key] = value as never;
  }
  return base;
}

// Payload builders

export function buildFileChangePayload(
  filePath: string,
  content: string,
  languageId: string,
  syncId: string,
  now: number = Date.now(),
): FileChangePayload {
  return { filePath, content, languageId, timestamp: now, syncId };
}

export function buildFileDeletePayload(
  filePath: string,
  syncId: string,
  now: number = Date.now(),
): FileDeletePayload {
  return { filePath, timestamp: now, syncId };
}

export function buildFileRenamePayload(
  oldPath: string,
  newPath: string,
  syncId: string,
  now: number = Date.now(),
): FileRenamePayload {
  return { oldPath, newPath, timestamp: now, syncId };
}

export function buildWorkspaceInventory(
  workspaceRoot: string,
  filePaths: string[],
  syncId: string,
  now: number = Date.now(),
): WorkspaceSyncPayload {
  return {
    syncId,
    workspaceRoot,
    fileCount: filePaths.length,
    files: filePaths.map((path) => ({
      path,
      languageId: '',
      sizeBytes: 0,
      lastModified: now,
    })),
    timestamp: now,
  };
}

// Debounce

/**
 * Returns true when the save should be debounced (i.e., already pending).
 * Helper that maintains a single-timer per debounce key.
 */
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(public readonly delayMs: number) {}

  schedule(fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, this.delayMs);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get isPending(): boolean {
    return this.timer !== null;
  }
}

// Connection state helpers

export interface StatusBarModel {
  text: string;
  tooltip: string;
}

/**
 * Pure mapping from connection state → status bar model.
 */
export function buildStatusBarModel(
  state: ConnectionState,
  detail?: string,
  reconnectAttempts: number = 0,
): StatusBarModel {
  switch (state) {
    case 'connected':
      return {
        text: '$(check-all) GHITA: Connected',
        tooltip: detail ?? 'Connected to GHITA Core Daemon. Sync active.',
      };
    case 'connecting':
      return { text: '$(sync~spin) GHITA: Connecting...', tooltip: 'Establishing WebSocket connection...' };
    case 'reconnecting':
      return {
        text: `$(sync~spin) GHITA: Reconnecting (${reconnectAttempts})`,
        tooltip: 'Connection lost. Attempting to reconnect...',
      };
    case 'error':
      return {
        text: '$(error) GHITA: Error',
        tooltip: detail ?? 'Connection error. Click to retry.',
      };
    case 'disconnected':
    default:
      return {
        text: '$(pulse) GHITA: Offline',
        tooltip: 'Click to connect VS Code with GHITA Core.',
      };
  }
}

// Socket URL

export function buildSocketUrl(config: SyncConfig): string {
  return `http://127.0.0.1:${config.corePort}`;
}

// Stats

export function emptyStats(): SyncStats {
  return {
    filesSent: 0,
    filesReceived: 0,
    syncErrors: 0,
    lastSyncAt: 0,
    totalBytesSent: 0,
  };
}

export function recordSend(stats: SyncStats, contentBytes: number, now: number = Date.now()): SyncStats {
  return {
    ...stats,
    filesSent: stats.filesSent + 1,
    lastSyncAt: now,
    totalBytesSent: stats.totalBytesSent + contentBytes,
  };
}

export function recordReceive(stats: SyncStats): SyncStats {
  return { ...stats, filesReceived: stats.filesReceived + 1 };
}

export function recordError(stats: SyncStats): SyncStats {
  return { ...stats, syncErrors: stats.syncErrors + 1 };
}