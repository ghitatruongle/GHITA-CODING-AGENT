// ==============================================================================
// GHITA CODING AGENT — Phase 18: VS Code Extension WebSocket Sync
// ==============================================================================
// Real-time bidirectional sync between VS Code workspace and GHITA Core daemon
// via Socket.io WebSocket transport. Features:
// - Socket.io connection with auto-reconnect & heartbeat
// - File save/create/delete/rename sync with content & diff payloads
// - Workspace batch sync with file inventory transmission
// - Connection state management with status bar feedback
// - Output channel for sync diagnostics
// - Configurable auto-sync and debounce
// ==============================================================================

import * as vscode from 'vscode';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncConfig {
  corePort: number;
  autoSync: boolean;
  debounceMs: number;
  maxRetries: number;
  reconnectDelayMs: number;
}

interface FileChangePayload {
  filePath: string;
  content: string;
  languageId: string;
  timestamp: number;
  syncId: string;
}

interface FileDeletePayload {
  filePath: string;
  timestamp: number;
  syncId: string;
}

interface FileRenamePayload {
  oldPath: string;
  newPath: string;
  timestamp: number;
  syncId: string;
}

interface WorkspaceSyncPayload {
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

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface SyncStats {
  filesSent: number;
  filesReceived: number;
  syncErrors: number;
  lastSyncAt: number;
  totalBytesSent: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let socket: Socket | null = null;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let connectionState: ConnectionState = 'disconnected';
let reconnectAttempts = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const syncStats: SyncStats = {
  filesSent: 0,
  filesReceived: 0,
  syncErrors: 0,
  lastSyncAt: 0,
  totalBytesSent: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSyncId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function log(message: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
  console.log(`[GHITA-Sidecar] ${message}`);
}

function getConfig(): SyncConfig {
  const config = vscode.workspace.getConfiguration('ghita');
  return {
    corePort: config.get<number>('ghita.corePort', 8080),
    autoSync: config.get<boolean>('ghita.autoSync', true),
    debounceMs: config.get<number>('ghita.debounceMs', 300),
    maxRetries: config.get<number>('ghita.maxRetries', 20),
    reconnectDelayMs: config.get<number>('ghita.reconnectDelayMs', 2000),
  };
}

function updateStatusBar(state: ConnectionState, detail?: string): void {
  if (!statusBarItem) return;

  connectionState = state;

  switch (state) {
    case 'connected':
      statusBarItem.text = `$(check-all) GHITA: Connected`;
      statusBarItem.tooltip = detail ?? 'Connected to GHITA Core Daemon. Sync active.';
      break;
    case 'connecting':
      statusBarItem.text = '$(sync~spin) GHITA: Connecting...';
      statusBarItem.tooltip = 'Establishing WebSocket connection...';
      break;
    case 'reconnecting':
      statusBarItem.text = `$(sync~spin) GHITA: Reconnecting (${reconnectAttempts})`;
      statusBarItem.tooltip = 'Connection lost. Attempting to reconnect...';
      break;
    case 'error':
      statusBarItem.text = '$(error) GHITA: Error';
      statusBarItem.tooltip = detail ?? 'Connection error. Click to retry.';
      break;
    case 'disconnected':
      statusBarItem.text = '$(pulse) GHITA: Offline';
      statusBarItem.tooltip = 'Click to connect VS Code with GHITA Core.';
      break;
  }
}

function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

// ---------------------------------------------------------------------------
// Socket.io Connection
// ---------------------------------------------------------------------------

function connectSocket(): Promise<boolean> {
  return new Promise((resolve) => {
    const config = getConfig();
    const url = `http://127.0.0.1:${config.corePort}`;

    // Disconnect existing socket
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    updateStatusBar('connecting');
    log(`Connecting to GHITA Core at ${url}...`);

    socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: config.maxRetries,
      reconnectionDelay: config.reconnectDelayMs,
      reconnectionDelayMax: 30000,
      timeout: 10000,
    });

    const timeoutId = setTimeout(() => {
      log('Connection timeout after 10s.');
      updateStatusBar('error', 'Connection timed out.');
      resolve(false);
    }, 10000);

    socket.on('connect', () => {
      clearTimeout(timeoutId);
      reconnectAttempts = 0;
      updateStatusBar('connected', `Connected on port :${config.corePort}. WebSocket sync active.`);
      log(`Connected successfully on port :${config.corePort}.`);

      // Send workspace inventory on connect
      const root = getWorkspaceRoot();
      if (root) {
        socket?.emit('workspace:identify', { workspaceRoot: root, timestamp: Date.now() });
        log(`Identified workspace root: ${root}`);
      }

      resolve(true);
    });

    socket.on('connect_error', (err: Error) => {
      clearTimeout(timeoutId);
      reconnectAttempts++;
      if (reconnectAttempts <= 1) {
        updateStatusBar('error', `Connection failed: ${err.message}`);
        log(`Connection error: ${err.message}`);
      }
    });

    socket.on('reconnect_attempt', (attempt: number) => {
      updateStatusBar('reconnecting');
      log(`Reconnect attempt ${attempt}...`);
    });

    socket.on('reconnect', () => {
      reconnectAttempts = 0;
      updateStatusBar('connected');
      log('Reconnected successfully.');
    });

    socket.on('disconnect', (reason: string) => {
      updateStatusBar('disconnected');
      log(`Disconnected: ${reason}`);
    });

    // Handle remote file changes (from GHITA Core → VS Code)
    socket.on('file:changed', (payload: { filePath: string; content: string }) => {
      log(`Received remote file change: ${payload.filePath}`);
      syncStats.filesReceived++;
      // Optionally apply to open document if matching
    });

    socket.on('file:deleted', (payload: { filePath: string }) => {
      log(`Received remote file delete: ${payload.filePath}`);
    });

    socket.on('sync:ack', (data: { syncId: string; status: string }) => {
      log(`Sync acknowledged: #${data.syncId} → ${data.status}`);
    });
  });
}

function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  reconnectAttempts = 0;
  updateStatusBar('disconnected');
  log('Socket disconnected.');
}

// ---------------------------------------------------------------------------
// File Sync Operations
// ---------------------------------------------------------------------------

async function syncFileOnSave(document: vscode.TextDocument): Promise<void> {
  if (!socket?.connected) return;

  const config = getConfig();
  if (!config.autoSync) return;

  // Debounce rapid saves
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const syncId = generateSyncId();
    const payload: FileChangePayload = {
      filePath: document.fileName,
      content: document.getText(),
      languageId: document.languageId,
      timestamp: Date.now(),
      syncId,
    };

    socket?.emit('file:save', payload);
    syncStats.filesSent++;
    syncStats.lastSyncAt = Date.now();
    syncStats.totalBytesSent += payload.content.length;
    log(
      `Synced file: ${document.fileName} (#${syncId}, ${(payload.content.length / 1024).toFixed(1)}KB)`,
    );
  }, config.debounceMs);
}

function syncFileDelete(filePath: string): void {
  if (!socket?.connected) return;

  const syncId = generateSyncId();
  const payload: FileDeletePayload = {
    filePath,
    timestamp: Date.now(),
    syncId,
  };

  socket.emit('file:delete', payload);
  log(`Synced file delete: ${filePath} (#${syncId})`);
}

function syncFileRename(oldPath: string, newPath: string): void {
  if (!socket?.connected) return;

  const syncId = generateSyncId();
  const payload: FileRenamePayload = {
    oldPath,
    newPath,
    timestamp: Date.now(),
    syncId,
  };

  socket.emit('file:rename', payload);
  log(`Synced file rename: ${oldPath} → ${newPath} (#${syncId})`);
}

async function syncWorkspace(): Promise<void> {
  if (!socket?.connected) {
    vscode.window.showWarningMessage('GHITA Sidecar is offline. Please connect first.');
    return;
  }

  const syncId = generateSyncId();
  const root = getWorkspaceRoot();

  if (!root) {
    vscode.window.showWarningMessage('No workspace folder is open.');
    return;
  }

  log(`Starting workspace sync #${syncId}...`);
  vscode.window.showInformationMessage(
    `Syncing workspace files with GHITA Core... (Sync #${syncId})`,
  );

  // Enumerate workspace files via VS Code API
  const files = await vscode.workspace.findFiles(
    '**/*.{ts,tsx,js,jsx,json,yaml,yml,md,css,html,rs,toml}',
    '**/node_modules/**',
    500,
  );

  const fileInventory: WorkspaceSyncPayload = {
    syncId,
    workspaceRoot: root,
    fileCount: files.length,
    files: files.map((f) => ({
      path: f.fsPath,
      languageId: '',
      sizeBytes: 0,
      lastModified: Date.now(),
    })),
    timestamp: Date.now(),
  };

  socket.emit('workspace:sync', fileInventory);
  log(`Workspace sync #${syncId}: sent ${files.length} files from ${root}`);
  vscode.window.showInformationMessage(
    `Workspace sync complete! ${files.length} files sent. (#${syncId})`,
  );
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  log('GHITA CODING AGENT VS Code Sidecar is now active (Phase 18).');

  // Output channel for diagnostics
  outputChannel = vscode.window.createOutputChannel('GHITA Sync');
  context.subscriptions.push(outputChannel);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(pulse) GHITA: Offline';
  statusBarItem.tooltip = 'Click to connect VS Code with GHITA Core.';
  statusBarItem.command = 'ghita-sidecar.connect';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Command: Connect
  const connectCmd = vscode.commands.registerCommand('ghita-sidecar.connect', async () => {
    if (connectionState === 'connected') {
      vscode.window.showInformationMessage('GHITA Sidecar is already connected.');
      return;
    }

    const connected = await connectSocket();
    if (connected) {
      const config = getConfig();
      vscode.window.showInformationMessage(
        `Successfully connected sidecar to GHITA Core on port ${config.corePort}!`,
      );
    } else {
      vscode.window.showErrorMessage(
        'Failed to connect to GHITA Core. Ensure the daemon is running.',
      );
    }
  });
  context.subscriptions.push(connectCmd);

  // Command: Disconnect
  const disconnectCmd = vscode.commands.registerCommand('ghita-sidecar.disconnect', () => {
    disconnectSocket();
    vscode.window.showInformationMessage('GHITA Sidecar disconnected.');
  });
  context.subscriptions.push(disconnectCmd);

  // Command: Sync Workspace
  const syncCmd = vscode.commands.registerCommand('ghita-sidecar.syncWorkspace', async () => {
    await syncWorkspace();
  });
  context.subscriptions.push(syncCmd);

  // Command: Show Stats
  const statsCmd = vscode.commands.registerCommand('ghita-sidecar.stats', () => {
    const msg = [
      `State: ${connectionState}`,
      `Files sent: ${syncStats.filesSent}`,
      `Files received: ${syncStats.filesReceived}`,
      `Errors: ${syncStats.syncErrors}`,
      `Total sent: ${(syncStats.totalBytesSent / 1024).toFixed(1)}KB`,
      `Last sync: ${syncStats.lastSyncAt ? new Date(syncStats.lastSyncAt).toLocaleString() : 'never'}`,
    ].join('\n');
    vscode.window.showInformationMessage(msg, { modal: true });
  });
  context.subscriptions.push(statsCmd);

  // Event: Auto-sync on file save
  const onSave = vscode.workspace.onDidSaveTextDocument((document) => {
    syncFileOnSave(document).catch((err) => {
      syncStats.syncErrors++;
      log(`Sync error on save: ${err}`);
    });
  });
  context.subscriptions.push(onSave);

  // Event: File delete
  const onDelete = vscode.workspace.onDidDeleteFiles((event) => {
    for (const file of event.files) {
      syncFileDelete(file.fsPath);
    }
  });
  context.subscriptions.push(onDelete);

  // Event: File rename
  const onRename = vscode.workspace.onDidRenameFiles((event) => {
    for (const file of event.files) {
      syncFileRename(file.oldUri.fsPath, file.newUri.fsPath);
    }
  });
  context.subscriptions.push(onRename);

  // Event: File create
  const onCreate = vscode.workspace.onDidCreateFiles(async (event) => {
    for (const file of event.files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        await syncFileOnSave(doc);
      } catch (err) {
        log(`Error syncing new file ${file.fsPath}: ${err}`);
      }
    }
  });
  context.subscriptions.push(onCreate);
}

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

export function deactivate() {
  disconnectSocket();
  if (debounceTimer) clearTimeout(debounceTimer);
  log('GHITA CODING AGENT VS Code Sidecar is deactivated.');
}
