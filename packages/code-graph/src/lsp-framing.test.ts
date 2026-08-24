// Regression tests for Track 2 fixes: LSP byte-length framing with multi-byte UTF-8.
import { describe, expect, it } from 'vitest';
import type { EventEmitter } from 'node:events';
import { LspClient } from './lsp-client.js';
import { DiagnosticsLedger } from './diagnostics-ledger.js';

function makeClient() {
  const ledger = new DiagnosticsLedger();
  return new LspClient({ id: 'test', command: 'noop', args: [] }, { ledger });
}

describe('LspClient JSON-RPC framing with multi-byte UTF-8', () => {
  it('parses a message containing Vietnamese text delivered across chunk boundaries', () => {
    const client = makeClient();
    const received: Array<{ filePath: string; diagnostics: Array<{ message: string }> }> = [];
    (client as unknown as EventEmitter).on('diagnostics', (payload) =>
      received.push(payload as { filePath: string; diagnostics: Array<{ message: string }> }),
    );

    const notification = {
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: 'file:///proj/t%C6%B0%C6%A1ng-%C4%91%E1%BB%91i.ts',
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            message: 'Lỗi cú pháp ở dòng đầu — tiếng Việt',
          },
        ],
      },
    };
    const body = Buffer.from(JSON.stringify(notification), 'utf-8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf-8');
    const frame = Buffer.concat([header, body]);

    const handleStdout = (client as unknown as { handleStdout(chunk: Buffer): void }).handleStdout;
    // Split INSIDE the multi-byte body so naive string-length math desyncs.
    handleStdout.call(client, frame.subarray(0, frame.length - 8));
    expect(received).toHaveLength(0); // incomplete — must wait for the rest
    handleStdout.call(client, frame.subarray(frame.length - 8));
    expect(received).toHaveLength(1);
    expect(received[0]?.diagnostics[0]?.message).toContain('tiếng Việt');
  });

  it('keeps framing in sync across multiple back-to-back unicode messages', () => {
    const client = makeClient();
    let count = 0;
    (client as unknown as EventEmitter).on('diagnostics', () => count++);

    const handleStdout = (client as unknown as { handleStdout(chunk: Buffer): void }).handleStdout;
    for (let i = 0; i < 3; i++) {
      const body = Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'textDocument/publishDiagnostics',
          params: {
            uri: `file:///p/f${i}.ts`,
            diagnostics: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                message: `Nội dung ${'😊'.repeat(i + 1)}`,
              },
            ],
          },
        }),
        'utf-8',
      );
      handleStdout.call(
        client,
        Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]),
      );
    }
    expect(count).toBe(3);
  });
});
