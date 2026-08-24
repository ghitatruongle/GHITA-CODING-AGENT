// Manages language server processes over stdio JSON-RPC, handles document sync,
// and streams live diagnostics into the Diagnostics Ledger.

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  type LspDiagnostic,
  type LspServerConfig,
  type LspTextEdit,
  type LspHoverResult,
  LspDiagnosticSeverity,
} from './lsp-types.js';
import { DiagnosticsLedger, DeferredDiagnosticsManager } from './diagnostics-ledger.js';

export interface LspClientOptions {
  ledger?: DiagnosticsLedger;
  deferredManager?: DeferredDiagnosticsManager;
  rootUri?: string;
}

export class LspClient extends EventEmitter {
  /** Hard deadline for any single LSP request — a hung server must not wedge start/stop. */
  private static readonly REQUEST_TIMEOUT_MS = 15_000;

  private process: ChildProcess | null = null;
  // Raw bytes, not a string: Content-Length counts UTF-8 bytes and string
  // indices silently diverge on multi-byte characters.
  private messageBuffer: Buffer = Buffer.alloc(0);
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private openDocuments = new Map<string, { version: number; text: string }>();

  public readonly ledger: DiagnosticsLedger;
  public readonly deferredManager: DeferredDiagnosticsManager;

  constructor(
    public readonly config: LspServerConfig,
    options: LspClientOptions = {},
  ) {
    super();
    this.ledger = options.ledger ?? new DiagnosticsLedger();
    this.deferredManager = options.deferredManager ?? new DeferredDiagnosticsManager(this.ledger);
  }

  /**
   * Start the language server process and perform initialize handshake.
   */
  async start(rootUri?: string): Promise<void> {
    if (this.process) return;

    try {
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      this.process.stdout?.on('data', (chunk: Buffer) => {
        this.handleStdout(chunk);
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        this.emit('server-log', chunk.toString('utf-8'));
      });

      this.process.on('error', (err: Error) => {
        this.emit('error', err);
      });

      this.process.on('exit', (code: number | null) => {
        this.emit('exit', code);
        this.cleanup();
      });

      // Send initialize request
      const root = rootUri ?? this.config.rootUri ?? process.cwd();
      await this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: `file://${root.replace(/\\/g, '/')}`,
        capabilities: {
          textDocument: {
            publishDiagnostics: { relatedInformation: true },
            formatting: { dynamicRegistration: false },
            hover: { contentFormat: ['markdown', 'plaintext'] },
          },
        },
      });

      this.sendNotification('initialized', {});
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  /**
   * Stop the language server. The shutdown request is raced against a short
   * deadline so an unresponsive server cannot wedge stop() itself.
   */
  async stop(): Promise<void> {
    if (!this.process) return;
    try {
      await Promise.race([
        this.sendRequest('shutdown', {}),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      this.sendNotification('exit', {});
    } catch {
      // Ignore errors on shutdown
    } finally {
      this.cleanup();
    }
  }

  /**
   * Notify language server that a document was opened.
   */
  didOpen(filePath: string, text: string, languageId?: string): void {
    const normalized = path.resolve(filePath);
    this.openDocuments.set(normalized, { version: 1, text });

    const uri = `file://${normalized.replace(/\\/g, '/')}`;
    const lang = languageId ?? this.config.languageId ?? this.detectLanguageId(filePath);

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: lang,
        version: 1,
        text,
      },
    });
  }

  /**
   * Notify language server that document content changed.
   */
  didChange(filePath: string, newText: string): void {
    const normalized = path.resolve(filePath);
    const doc = this.openDocuments.get(normalized) ?? { version: 0, text: '' };
    doc.version += 1;
    doc.text = newText;
    this.openDocuments.set(normalized, doc);

    const uri = `file://${normalized.replace(/\\/g, '/')}`;
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: doc.version },
      contentChanges: [{ text: newText }],
    });
  }

  /**
   * Notify language server that document was saved.
   */
  didSave(filePath: string, text?: string): void {
    const normalized = path.resolve(filePath);
    const uri = `file://${normalized.replace(/\\/g, '/')}`;
    this.sendNotification('textDocument/didSave', {
      textDocument: { uri },
      text,
    });
  }

  /**
   * Notify language server that document was closed.
   */
  didClose(filePath: string): void {
    const normalized = path.resolve(filePath);
    this.openDocuments.delete(normalized);
    const uri = `file://${normalized.replace(/\\/g, '/')}`;
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * Request document formatting.
   */
  async formatDocument(filePath: string): Promise<LspTextEdit[]> {
    const normalized = path.resolve(filePath);
    const uri = `file://${normalized.replace(/\\/g, '/')}`;
    const result = (await this.sendRequest('textDocument/formatting', {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    })) as LspTextEdit[] | null;

    return result ?? [];
  }

  /**
   * Request hover information.
   */
  async getHover(
    filePath: string,
    line: number,
    character: number,
  ): Promise<LspHoverResult | null> {
    const normalized = path.resolve(filePath);
    const uri = `file://${normalized.replace(/\\/g, '/')}`;
    const result = (await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    })) as { contents: string | { value: string } } | null;

    if (!result) return null;
    const contents =
      typeof result.contents === 'string'
        ? result.contents
        : typeof result.contents?.value === 'string'
          ? result.contents.value
          : JSON.stringify(result.contents);

    return { contents };
  }

  /**
   * Manually ingest diagnostics (useful for testing and simulated language server outputs).
   */
  ingestDiagnostics(filePath: string, rawDiagnostics: Array<Partial<LspDiagnostic>>): void {
    const normalized = path.resolve(filePath);
    const diagnostics: LspDiagnostic[] = rawDiagnostics.map((d) => ({
      filePath: normalized,
      range: d.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      severity: d.severity ?? LspDiagnosticSeverity.Error,
      code: d.code,
      source: d.source ?? this.config.id,
      message: d.message ?? 'Unknown diagnostic',
      recordedAt: Date.now(),
    }));

    const diff = this.ledger.recordDiagnostics(normalized, diagnostics, this.config.id);
    if (diff.newDiagnostics.length > 0) {
      this.deferredManager.enqueue(diff.newDiagnostics);
    }
    this.emit('diagnostics', { filePath: normalized, diagnostics, diff });
  }

  // JSON-RPC Protocol Transport
  
  private sendRequest(
    method: string,
    params: unknown,
    timeoutMs = LspClient.REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.writeMessage({ jsonrpc: '2.0', id, method, params });
    });
  }

  private sendNotification(method: string, params: unknown): void {
    this.writeMessage({ jsonrpc: '2.0', method, params });
  }

  private writeMessage(msg: Record<string, unknown>): void {
    if (!this.process?.stdin || !this.process.stdin.writable) return;
    const json = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n`;
    this.process.stdin.write(header + json);
  }

  private handleStdout(chunk: Buffer): void {
    this.messageBuffer = Buffer.concat([this.messageBuffer, chunk]);

    while (true) {
      const headerEnd = this.messageBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = this.messageBuffer.subarray(0, headerEnd).toString('utf-8');
      const headerMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!headerMatch) {
        // Malformed header block — drop it and keep scanning.
        this.messageBuffer = this.messageBuffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLen = parseInt(headerMatch[1] ?? '0', 10);
      const bodyStart = headerEnd + 4;

      // Compare BYTE counts against the byte buffer — never string lengths.
      if (this.messageBuffer.length < bodyStart + contentLen) {
        // Incomplete message body
        break;
      }

      const bodyStr = this.messageBuffer
        .subarray(bodyStart, bodyStart + contentLen)
        .toString('utf-8');
      this.messageBuffer = this.messageBuffer.subarray(bodyStart + contentLen);

      try {
        const parsed = JSON.parse(bodyStr);
        this.handleMessage(parsed);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  private handleMessage(msg: {
    id?: number;
    method?: string;
    result?: unknown;
    error?: unknown;
    params?: unknown;
  }): void {
    // Response to a request
    if (typeof msg.id === 'number' && this.pendingRequests.has(msg.id)) {
      const handler = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (handler) clearTimeout(handler.timer);
      if (msg.error) {
        handler?.reject(new Error(JSON.stringify(msg.error)));
      } else {
        handler?.resolve(msg.result);
      }
      return;
    }

    // Server notifications
    if (msg.method === 'textDocument/publishDiagnostics') {
      const params = msg.params as {
        uri: string;
        diagnostics: Array<{
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
          severity?: number;
          code?: string | number;
          source?: string;
          message: string;
        }>;
      };

      const fileUri = params.uri;
      const filePath = fileUri.startsWith('file:///')
        ? fileUri.replace(/^file:\/\/\//, process.platform === 'win32' ? '' : '/')
        : fileUri.replace(/^file:\/\//, '');
      const decodedPath = decodeURIComponent(filePath);

      const diagnostics: LspDiagnostic[] = (params.diagnostics ?? []).map((d) => ({
        filePath: decodedPath,
        range: d.range,
        severity: (d.severity as LspDiagnosticSeverity) ?? LspDiagnosticSeverity.Error,
        code: d.code,
        source: d.source ?? this.config.id,
        message: d.message,
        recordedAt: Date.now(),
      }));

      const diff = this.ledger.recordDiagnostics(decodedPath, diagnostics, this.config.id);
      if (diff.newDiagnostics.length > 0) {
        this.deferredManager.enqueue(diff.newDiagnostics);
      }
      this.emit('diagnostics', { filePath: decodedPath, diagnostics, diff });
    }
  }

  private cleanup(): void {
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore
      }
      this.process = null;
    }
    for (const { reject, timer } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(new Error('LSP server terminated'));
    }
    this.pendingRequests.clear();
    this.messageBuffer = Buffer.alloc(0);
  }

  private detectLanguageId(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.rs':
        return 'rust';
      case '.py':
        return 'python';
      case '.go':
        return 'go';
      case '.json':
        return 'json';
      default:
        return 'plaintext';
    }
  }
}

/**
 * Multi-server LSP Manager: routes file events to matching language server clients
 * based on file extensions.
 */
export class LspManager {
  private servers = new Map<string, LspClient>();
  public readonly ledger: DiagnosticsLedger;
  public readonly deferredManager: DeferredDiagnosticsManager;

  constructor() {
    this.ledger = new DiagnosticsLedger();
    this.deferredManager = new DeferredDiagnosticsManager(this.ledger);
  }

  /**
   * Register a language server configuration.
   */
  registerServer(config: LspServerConfig): LspClient {
    const client = new LspClient(config, {
      ledger: this.ledger,
      deferredManager: this.deferredManager,
    });
    this.servers.set(config.id, client);
    return client;
  }

  /**
   * Get an LSP client by ID.
   */
  getServer(id: string): LspClient | undefined {
    return this.servers.get(id);
  }

  /**
   * Find matching LSP client for a given file path.
   */
  getClientForFile(filePath: string): LspClient | undefined {
    const ext = path.extname(filePath).toLowerCase();
    for (const server of this.servers.values()) {
      if (server.config.extensions.includes(ext)) {
        return server;
      }
    }
    return undefined;
  }

  /**
   * Notify all relevant servers that a file was opened.
   */
  didOpenFile(filePath: string, content: string): void {
    const client = this.getClientForFile(filePath);
    if (client) {
      client.didOpen(filePath, content);
    }
  }

  /**
   * Notify all relevant servers that a file changed.
   */
  didChangeFile(filePath: string, newContent: string): void {
    const client = this.getClientForFile(filePath);
    if (client) {
      client.didChange(filePath, newContent);
    }
  }

  /**
   * Notify all relevant servers that a file was saved.
   */
  didSaveFile(filePath: string, content?: string): void {
    const client = this.getClientForFile(filePath);
    if (client) {
      client.didSave(filePath, content);
    }
  }

  /**
   * Notify all relevant servers that a file was closed.
   */
  didCloseFile(filePath: string): void {
    const client = this.getClientForFile(filePath);
    if (client) {
      client.didClose(filePath);
    }
  }

  /**
   * Stop all registered language server processes.
   */
  async stopAll(): Promise<void> {
    for (const server of this.servers.values()) {
      await server.stop();
    }
    this.servers.clear();
  }
}
