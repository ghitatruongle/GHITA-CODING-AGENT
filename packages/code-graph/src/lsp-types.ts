// ==============================================================================
// GHITA CODING AGENT - Track 3 (v1.1.5-beta1): LSP Types
// ==============================================================================
// Core types for LSP client communication, diagnostics ledger, and deferred feedback.
// ==============================================================================

export enum LspDiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface LspPosition {
  /** Line position in a document (zero-based) */
  line: number;
  /** Character offset on a line in a document (zero-based) */
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  /** Target file path */
  filePath: string;
  /** Range within file where diagnostic applies */
  range: LspRange;
  /** Severity level (1: Error, 2: Warning, 3: Info, 4: Hint) */
  severity: LspDiagnosticSeverity;
  /** Error/diagnostic code if available (e.g. "TS2304", "E0308") */
  code?: string | number;
  /** Source name (e.g. "typescript", "rust-analyzer", "pyright", "gopls") */
  source?: string;
  /** Human-readable diagnostic message */
  message: string;
  /** Timestamp when diagnostic was received */
  recordedAt: number;
}

export interface DiagnosticsDiff {
  /** Diagnostics newly appeared in this update */
  newDiagnostics: LspDiagnostic[];
  /** Diagnostics previously present that are now resolved */
  resolvedDiagnostics: LspDiagnostic[];
  /** Diagnostics still active and unchanged */
  unchangedDiagnostics: LspDiagnostic[];
}

export interface LspServerConfig {
  /** Unique server identifier (e.g. "typescript", "rust-analyzer") */
  id: string;
  /** Executable binary name / path */
  command: string;
  /** Command line arguments */
  args: string[];
  /** File extensions handled by this language server */
  extensions: string[];
  /** Language identifier for LSP (e.g. "typescript", "rust", "python") */
  languageId?: string;
  /** Workspace root directory */
  rootUri?: string;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspHoverResult {
  contents: string;
  range?: LspRange;
}

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}
