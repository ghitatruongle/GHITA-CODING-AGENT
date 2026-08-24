import { describe, it, expect, vi } from 'vitest';
import {
  lspSeverityToMonaco,
  lspDiagnosticToMarker,
  MonacoLspBridge,
  type Monaco,
} from './monacoLsp';
import { LspDiagnosticSeverity, type LspDiagnostic } from '@ghita/code-graph';

describe('MonacoLspBridge', () => {
  const mockMonaco = {
    MarkerSeverity: {
      Error: 8,
      Warning: 4,
      Info: 2,
      Hint: 1,
    },
    Range: class Range {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
    Uri: {
      parse: (uri: string) => ({ uri }),
    },
    languages: {
      SymbolKind: {
        Class: 5,
        Interface: 11,
        Function: 12,
        Method: 6,
        TypeParameter: 26,
        Enum: 10,
        Variable: 13,
        Module: 2,
      },
      registerHoverProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      registerDefinitionProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      registerDocumentSymbolProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    editor: {
      setModelMarkers: vi.fn(),
    },
  } as unknown as Monaco;

  it('maps LSP severity correctly to Monaco MarkerSeverity', () => {
    expect(lspSeverityToMonaco(LspDiagnosticSeverity.Error, mockMonaco)).toBe(8);
    expect(lspSeverityToMonaco(LspDiagnosticSeverity.Warning, mockMonaco)).toBe(4);
    expect(lspSeverityToMonaco(LspDiagnosticSeverity.Information, mockMonaco)).toBe(2);
    expect(lspSeverityToMonaco(LspDiagnosticSeverity.Hint, mockMonaco)).toBe(1);
  });

  it('translates LspDiagnostic to Monaco Marker data', () => {
    const diag: LspDiagnostic = {
      filePath: '/workspace/src/app.ts',
      message: 'Cannot find name "foo"',
      severity: LspDiagnosticSeverity.Error,
      code: 'TS2304',
      source: 'typescript',
      range: {
        start: { line: 10, character: 4 },
        end: { line: 10, character: 7 },
      },
      recordedAt: Date.now(),
    };

    const marker = lspDiagnosticToMarker(diag, mockMonaco);
    expect(marker.severity).toBe(8);
    expect(marker.message).toBe('Cannot find name "foo"');
    expect(marker.source).toBe('typescript');
    expect(marker.code).toBe('TS2304');
    expect(marker.startLineNumber).toBe(11); // 0-based -> 1-based
    expect(marker.startColumn).toBe(5);
    expect(marker.endLineNumber).toBe(11);
    expect(marker.endColumn).toBe(8);
  });

  it('sets model markers for multiple diagnostics', () => {
    const mockModel = { id: 'model-1' } as any;
    const diags: LspDiagnostic[] = [
      {
        filePath: '/test.ts',
        message: 'Unused variable x',
        severity: LspDiagnosticSeverity.Warning,
        code: 'TS6133',
        range: { start: { line: 2, character: 6 }, end: { line: 2, character: 7 } },
        recordedAt: Date.now(),
      },
    ];

    MonacoLspBridge.setModelDiagnostics(mockMonaco, mockModel, diags);
    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockModel,
      'ghita-lsp',
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Unused variable x',
          severity: 4,
          startLineNumber: 3,
        }),
      ]),
    );
  });

  it('registers language providers without duplicate registration', () => {
    MonacoLspBridge.dispose();
    MonacoLspBridge.registerProviders(mockMonaco, {
      getHover: vi.fn(),
      getDefinition: vi.fn(),
      getFileSymbols: vi.fn(),
    });

    expect(mockMonaco.languages.registerHoverProvider).toHaveBeenCalled();
    expect(mockMonaco.languages.registerDefinitionProvider).toHaveBeenCalled();
    expect(mockMonaco.languages.registerDocumentSymbolProvider).toHaveBeenCalled();

    // Calling again should not re-register existing languages
    const countBefore = (mockMonaco.languages.registerHoverProvider as any).mock.calls.length;
    MonacoLspBridge.registerProviders(mockMonaco, {});
    const countAfter = (mockMonaco.languages.registerHoverProvider as any).mock.calls.length;
    expect(countAfter).toBe(countBefore);
  });
});
