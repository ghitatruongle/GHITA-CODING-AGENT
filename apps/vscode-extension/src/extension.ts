// ==============================================================================
// GHITA CODING AGENT — VS Code Sidecar Extension
// ==============================================================================

import * as vscode from 'vscode';
import { generateUUID } from '@ghita/shared';

let statusBarItem: vscode.StatusBarItem | undefined;
let isConnected = false;

/**
 * VS Code Extension Activation Lifecycle
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('GHITA CODING AGENT VS Code Sidecar is now active.');

  // Create Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(1, 100);
  statusBarItem.text = '$(pulse) GHITA: Offline';
  statusBarItem.tooltip = 'Click to connect VS Code with GHITA Core gRPC Server';
  statusBarItem.command = 'ghita-sidecar.connect';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register command: Connect Sidecar
  const connectCommand = vscode.commands.registerCommand('ghita-sidecar.connect', async () => {
    const config = vscode.workspace.getConfiguration('ghita');
    const port = config.get<number>('ghita.corePort', 8080);

    if (isConnected) {
      vscode.window.showInformationMessage(`GHITA Sidecar is already connected on gRPC port :${port}.`);
      return;
    }

    // Mock establishing JSON-RPC over WebSocket or gRPC transport with GHITA Core daemon
if (statusBarItem) {
    statusBarItem.text = '$(sync~spin) GHITA: Connecting...';
  }

  setTimeout(() => {
    isConnected = true;
    if (statusBarItem) {
      statusBarItem.text = `$(check-all) GHITA: Connected (:${port})`;
      statusBarItem.tooltip = `Connected to GHITA Core Daemon on gRPC :${port}. Sync active.`;
    }
      vscode.window.showInformationMessage(`Successfully connected sidecar to GHITA Core daemon on port ${port}! Syncing active workspace...`);
    }, 1200);
  });
  context.subscriptions.push(connectCommand);

  // Register command: Sync Workspace Files
  const syncCommand = vscode.commands.registerCommand('ghita-sidecar.syncWorkspace', async () => {
    if (!isConnected) {
      vscode.window.showWarningMessage('GHITA Sidecar is offline. Please run "GHITA: Connect Sidecar" command first.');
      return;
    }

    const syncId = generateUUID().slice(0, 8);
    vscode.window.showInformationMessage(`Syncing active workspace files with GHITA Daemon... (Sync ID: #${syncId})`);

    // Simulate batch workspace analysis payload transmission
    setTimeout(() => {
      vscode.window.showInformationMessage(`Workspace files successfully synchronized! Daemon is updated (Sync ID: #${syncId}).`);
    }, 1000);
  });
  context.subscriptions.push(syncCommand);

  // Register Event: Auto-Sync files on save
  const onSaveEvent = vscode.workspace.onDidSaveTextDocument((document) => {
    const config = vscode.workspace.getConfiguration('ghita');
    const autoSync = config.get<boolean>('ghita.autoSync', true);

    if (isConnected && autoSync) {
      // Simulate transmitting updated file diffs to Core
      console.log(`[GHITA-Sidecar] Syncing file change: ${document.fileName}`);
    }
  });
  context.subscriptions.push(onSaveEvent);
}

/**
 * VS Code Extension Deactivation Lifecycle
 */
export function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  isConnected = false;
  console.log('GHITA CODING AGENT VS Code Sidecar is deactivated.');
}
