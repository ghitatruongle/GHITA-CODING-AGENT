// Connects Monaco Editor with the Code Knowledge Graph & LSP Client/Ledger:
// - Translates LSP diagnostics to Monaco model markers in real-time
// - Registers rich Hover Providers (types, docs, JSDoc)
// - Registers Definition Providers for jump-to-definition
// - Registers Document Symbol Providers for active file AST outline

import type * as monacoType from 'monaco-editor';
import {
  type LspDiagnostic,
  LspDiagnosticSeverity,
  type LspPosition,
  type LspLocation,
  type LspHoverResult,
  type CodeNode,
} from '@ghita/code-graph';

export type Monaco = typeof monacoType;

/**
 * Maps LSP severity enum to Monaco editor MarkerSeverity values.
 * Error = 8, Warning = 4, Info = 2, Hint = 1
 */
export function lspSeverityToMonaco(
  severity: LspDiagnosticSeverity,
  monaco: Monaco,
): monacoType.MarkerSeverity {
  switch (severity) {
    case LspDiagnosticSeverity.Error:
      return monaco.MarkerSeverity.Error;
    case LspDiagnosticSeverity.Warning:
      return monaco.MarkerSeverity.Warning;
    case LspDiagnosticSeverity.Information:
      return monaco.MarkerSeverity.Info;
    case LspDiagnosticSeverity.Hint:
    default:
      return monaco.MarkerSeverity.Hint;
  }
}

/**
 * Converts an LspDiagnostic to Monaco editor IMarkerData.
 */
export function lspDiagnosticToMarker(
  diagnostic: LspDiagnostic,
  monaco: Monaco,
): monacoType.editor.IMarkerData {
  return {
    severity: lspSeverityToMonaco(diagnostic.severity, monaco),
    message: diagnostic.message,
    source: diagnostic.source || 'LSP',
    code: diagnostic.code !== undefined ? String(diagnostic.code) : undefined,
    startLineNumber: (diagnostic.range.start.line ?? 0) + 1,
    startColumn: (diagnostic.range.start.character ?? 0) + 1,
    endLineNumber: (diagnostic.range.end.line ?? diagnostic.range.start.line ?? 0) + 1,
    endColumn: (diagnostic.range.end.character ?? diagnostic.range.start.character ?? 0) + 1,
  };
}

export interface MonacoLspBridgeOptions {
  getHover?: (filePath: string, position: LspPosition) => Promise<LspHoverResult | null>;
  getDefinition?: (filePath: string, position: LspPosition) => Promise<LspLocation[] | null>;
  getFileSymbols?: (filePath: string) => Promise<CodeNode[] | null>;
}

export class MonacoLspBridge {
  private static registeredLanguages = new Set<string>();
  private static activeDisposables: monacoType.IDisposable[] = [];

  /**
   * Sets markers on a given Monaco text model for LSP diagnostics.
   */
  static setModelDiagnostics(
    monaco: Monaco,
    model: monacoType.editor.ITextModel,
    diagnostics: LspDiagnostic[],
    owner = 'ghita-lsp',
  ): void {
    const markers = diagnostics.map((d) => lspDiagnosticToMarker(d, monaco));
    monaco.editor.setModelMarkers(model, owner, markers);
  }

  /**
   * Registers LSP language feature providers (Hover, Definition, Document Symbols)
   * for specified languages (or all common coding languages).
   */
  static registerProviders(
    monaco: Monaco,
    options: MonacoLspBridgeOptions = {},
    languages = [
      'typescript',
      'javascript',
      'javascriptreact',
      'typescriptreact',
      'rust',
      'python',
      'json',
    ],
  ): void {
    for (const lang of languages) {
      if (this.registeredLanguages.has(lang)) continue;
      this.registeredLanguages.add(lang);

      // 1. Hover Provider
      if (options.getHover) {
        const hoverDisposable = monaco.languages.registerHoverProvider(lang, {
          provideHover: async (model, position) => {
            const filePath = model.uri.fsPath || model.uri.path;
            const lspPos: LspPosition = {
              line: position.lineNumber - 1,
              character: position.column - 1,
            };

            try {
              const res = await options.getHover?.(filePath, lspPos);
              if (!res || !res.contents) return null;

              return {
                range: res.range
                  ? new monaco.Range(
                      res.range.start.line + 1,
                      res.range.start.character + 1,
                      res.range.end.line + 1,
                      res.range.end.character + 1,
                    )
                  : undefined,
                contents: [{ value: res.contents, isTrusted: true }],
              };
            } catch {
              return null;
            }
          },
        });
        this.activeDisposables.push(hoverDisposable);
      }

      // 2. Definition Provider
      if (options.getDefinition) {
        const defDisposable = monaco.languages.registerDefinitionProvider(lang, {
          provideDefinition: async (model, position) => {
            const filePath = model.uri.fsPath || model.uri.path;
            const lspPos: LspPosition = {
              line: position.lineNumber - 1,
              character: position.column - 1,
            };

            try {
              const locations = await options.getDefinition?.(filePath, lspPos);
              if (!locations || locations.length === 0) return null;

              return locations.map((loc) => ({
                uri: monaco.Uri.parse(loc.uri),
                range: new monaco.Range(
                  loc.range.start.line + 1,
                  loc.range.start.character + 1,
                  loc.range.end.line + 1,
                  loc.range.end.character + 1,
                ),
              }));
            } catch {
              return null;
            }
          },
        });
        this.activeDisposables.push(defDisposable);
      }

      // 3. Document Symbol Provider (AST Outline)
      if (options.getFileSymbols) {
        const symbolDisposable = monaco.languages.registerDocumentSymbolProvider(lang, {
          provideDocumentSymbols: async (model) => {
            const filePath = model.uri.fsPath || model.uri.path;
            try {
              const nodes = await options.getFileSymbols?.(filePath);
              if (!nodes || nodes.length === 0) return [];

              return nodes.map((node) => {
                const range = new monaco.Range(
                  node.startLine ?? 1,
                  1,
                  node.endLine ?? node.startLine ?? 1,
                  1,
                );

                let symbolKind = monaco.languages.SymbolKind.Variable;
                switch (node.kind) {
                  case 'class':
                    symbolKind = monaco.languages.SymbolKind.Class;
                    break;
                  case 'interface':
                    symbolKind = monaco.languages.SymbolKind.Interface;
                    break;
                  case 'function':
                    symbolKind = monaco.languages.SymbolKind.Function;
                    break;
                  case 'method':
                    symbolKind = monaco.languages.SymbolKind.Method;
                    break;
                  case 'type':
                    symbolKind = monaco.languages.SymbolKind.TypeParameter;
                    break;
                  case 'enum':
                    symbolKind = monaco.languages.SymbolKind.Enum;
                    break;
                  case 'module':
                    symbolKind = monaco.languages.SymbolKind.Module;
                    break;
                }

                return {
                  name: node.name,
                  detail: node.docComment || node.excerpt || '',
                  kind: symbolKind,
                  tags: [],
                  range,
                  selectionRange: range,
                };
              });
            } catch {
              return [];
            }
          },
        });
        this.activeDisposables.push(symbolDisposable);
      }
    }
  }

  /**
   * Cleanup all registered Monaco providers.
   */
  static dispose(): void {
    for (const d of this.activeDisposables) {
      d.dispose();
    }
    this.activeDisposables = [];
    this.registeredLanguages.clear();
  }
}
