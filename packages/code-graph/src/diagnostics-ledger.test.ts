// ==============================================================================
// LSP Diagnostics Ledger & Deferred Feedback Unit Tests (Track 3.5)
// ==============================================================================

import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticsLedger, DeferredDiagnosticsManager } from './diagnostics-ledger.js';
import { LspManager } from './lsp-client.js';
import { LspDiagnosticSeverity, type LspDiagnostic } from './lsp-types.js';

describe('DiagnosticsLedger', () => {
  let ledger: DiagnosticsLedger;

  beforeEach(() => {
    ledger = new DiagnosticsLedger();
  });

  it('records diagnostics and computes diffs (new vs resolved)', () => {
    const file = '/src/auth.ts';

    // 1. Initial diagnostics with 2 errors
    const diag1: LspDiagnostic = {
      filePath: file,
      range: { start: { line: 10, character: 2 }, end: { line: 10, character: 15 } },
      severity: LspDiagnosticSeverity.Error,
      code: 'TS2304',
      message: "Cannot find name 'user'",
      source: 'typescript',
      recordedAt: 1000,
    };
    const diag2: LspDiagnostic = {
      filePath: file,
      range: { start: { line: 20, character: 4 }, end: { line: 20, character: 10 } },
      severity: LspDiagnosticSeverity.Warning,
      code: 'TS6133',
      message: "'token' is declared but never read",
      source: 'typescript',
      recordedAt: 1000,
    };

    const diff1 = ledger.recordDiagnostics(file, [diag1, diag2], 'typescript');
    expect(diff1.newDiagnostics).toHaveLength(2);
    expect(diff1.resolvedDiagnostics).toHaveLength(0);

    // 2. Second turn: error 1 fixed, warning remains, error 3 introduced
    const diag3: LspDiagnostic = {
      filePath: file,
      range: { start: { line: 25, character: 1 }, end: { line: 25, character: 12 } },
      severity: LspDiagnosticSeverity.Error,
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'",
      source: 'typescript',
      recordedAt: 2000,
    };

    const diff2 = ledger.recordDiagnostics(file, [diag2, diag3], 'typescript');
    expect(diff2.newDiagnostics).toHaveLength(1);
    expect(diff2.newDiagnostics[0]?.code).toBe('TS2322');
    expect(diff2.resolvedDiagnostics).toHaveLength(1);
    expect(diff2.resolvedDiagnostics[0]?.code).toBe('TS2304');
    expect(diff2.unchangedDiagnostics).toHaveLength(1);
    expect(diff2.unchangedDiagnostics[0]?.code).toBe('TS6133');

    // 3. Query summary
    const summary = ledger.getSummary();
    expect(summary.errorsCount).toBe(1);
    expect(summary.warningsCount).toBe(1);
    expect(summary.filesWithErrors).toContain(path.resolve(file));
  });

  it('filters diagnostics by severity', () => {
    const file = '/src/utils.ts';
    ledger.recordDiagnostics(file, [
      {
        filePath: file,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
        severity: LspDiagnosticSeverity.Error,
        message: 'Syntax error',
        recordedAt: 1000,
      },
      {
        filePath: file,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 5 } },
        severity: LspDiagnosticSeverity.Hint,
        message: 'Consider const',
        recordedAt: 1000,
      },
    ]);

    const onlyErrors = ledger.getDiagnostics(file, LspDiagnosticSeverity.Error);
    expect(onlyErrors).toHaveLength(1);
    expect(onlyErrors[0]?.message).toBe('Syntax error');

    const all = ledger.getDiagnostics(file, LspDiagnosticSeverity.Hint);
    expect(all).toHaveLength(2);
  });
});

describe('DeferredDiagnosticsManager', () => {
  it('enqueues new diagnostics and formats observation feedback', () => {
    const ledger = new DiagnosticsLedger();
    const deferred = new DeferredDiagnosticsManager(ledger);

    expect(deferred.hasPending()).toBe(false);
    expect(deferred.formatObservationMessage()).toBeNull();

    const diag: LspDiagnostic = {
      filePath: '/workspace/src/service.ts',
      range: { start: { line: 14, character: 4 }, end: { line: 14, character: 18 } },
      severity: LspDiagnosticSeverity.Error,
      code: 'TS2304',
      message: "Cannot find name 'database'",
      source: 'typescript',
      recordedAt: Date.now(),
    };

    deferred.enqueue([diag]);
    expect(deferred.hasPending()).toBe(true);

    const message = deferred.formatObservationMessage('/workspace');
    expect(message).toBeDefined();
    expect(message).toContain('[LSP Diagnostics Feedback]');
    expect(message).toContain("src/service.ts:15:5 - Error (TS2304): Cannot find name 'database'");

    // Drained: next check returns null
    expect(deferred.hasPending()).toBe(false);
    expect(deferred.formatObservationMessage()).toBeNull();
  });
});

describe('LspManager', () => {
  it('registers servers and routes file events by extension', () => {
    const manager = new LspManager();

    const tsClient = manager.registerServer({
      id: 'typescript',
      command: 'typescript-language-server',
      args: ['--stdio'],
      extensions: ['.ts', '.tsx', '.js'],
    });

    const rustClient = manager.registerServer({
      id: 'rust-analyzer',
      command: 'rust-analyzer',
      args: [],
      extensions: ['.rs'],
    });

    expect(manager.getClientForFile('app.ts')).toBe(tsClient);
    expect(manager.getClientForFile('main.rs')).toBe(rustClient);
    expect(manager.getClientForFile('script.py')).toBeUndefined();

    // Ingest simulated diagnostic through client
    tsClient.ingestDiagnostics('/src/index.ts', [
      {
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } },
        severity: LspDiagnosticSeverity.Error,
        message: 'Unused import',
        code: 'TS6133',
      },
    ]);

    expect(manager.ledger.getDiagnostics()).toHaveLength(1);
    expect(manager.deferredManager.hasPending()).toBe(true);

    const feedback = manager.deferredManager.formatObservationMessage('/src');
    expect(feedback).toContain('index.ts:3:1 - Error (TS6133): Unused import');
  });
});
