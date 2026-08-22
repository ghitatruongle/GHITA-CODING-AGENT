// ==============================================================================
// GHITA CODING AGENT — Phase 18: Code Editor (Monaco + Diagnostics + Diff View)
// ==============================================================================
// Enhanced Monaco editor with:
// - Diagnostic markers (error, warning, info, hint) with gutter icons
// - Inline diff view (original vs modified) with syntax highlighting
// - Problem panel showing all diagnostics with filtering
// - Configurable theme and keybindings
// ==============================================================================

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';
import { MonacoLspBridge, type Monaco } from '../lib/monacoLsp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Diagnostic {
  /** Line number (1-based) */
  line: number;
  /** Start column (1-based) */
  column: number;
  /** End column (1-based) */
  endColumn?: number;
  /** Severity level */
  severity: 'error' | 'warning' | 'info' | 'hint';
  /** Diagnostic message */
  message: string;
  /** Source (e.g. ESLint, TypeScript) */
  source?: string;
  /** Diagnostic code */
  code?: string;
}

// ---------------------------------------------------------------------------
// Monaco theme — registered once at module load (P2-3, deep review pass #2)
// ---------------------------------------------------------------------------
// The previous code called `defineTheme('ghita-dark', …)` inside both
// handleMount and handleDiffMount with different rule sets, so toggling
// between editor and diff mode would replace the theme definition with the
// less-coloured diff variant. Centralise the definition here so all mounts
// see the same theme.
const GHITA_DARK_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'comment', foreground: '606080', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c084fc' },
    { token: 'string', foreground: '22c55e' },
    { token: 'number', foreground: 'eab308' },
    { token: 'type', foreground: '818cf8' },
  ],
  colors: {
    'editor.background': '#0a0a1a',
    'editor.foreground': '#e0e0e0',
    'editor.lineHighlightBackground': '#1a1a2e',
    'editor.selectionBackground': '#a78bfa33',
    'editorCursor.foreground': '#a78bfa',
    'editorLineNumber.foreground': '#404060',
    'editorLineNumber.activeForeground': '#818cf8',
    'editorIndentGuide.background1': '#1a1a2e',
    'editorIndentGuide.activeBackground1': '#2a2a4e',
    'editor.selectionHighlightBackground': '#818cf822',
    'editorBracketMatch.background': '#818cf833',
    'editorBracketMatch.border': '#818cf866',
    'diffEditor.insertedTextBackground': '#22c55e22',
    'diffEditor.removedTextBackground': '#ef444422',
    'diffEditor.insertedLineBackground': '#22c55e11',
    'diffEditor.removedLineBackground': '#ef444411',
  },
};

// We can't call defineTheme until the monaco editor is loaded (the AMD
// loader resolves it on first mount). We register on the first mount, then
// reuse the cached registration on every subsequent mount.
let ghitaDarkThemeRegistered = false;
function ensureGhitaDarkTheme(monaco: {
  editor: {
    defineTheme: (name: string, theme: typeof GHITA_DARK_THEME) => void;
    setTheme: (name: string) => void;
  };
}): void {
  if (!ghitaDarkThemeRegistered) {
    monaco.editor.defineTheme('ghita-dark', GHITA_DARK_THEME);
    ghitaDarkThemeRegistered = true;
  }
  monaco.editor.setTheme('ghita-dark');
}

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  onSave?: () => void;
  onSaveAll?: () => void;
  /** Diagnostics to display in the editor */
  diagnostics?: Diagnostic[];
  /** Original value for diff comparison (enables diff view when provided) */
  originalValue?: string;
  /** Diff view mode: inline or side-by-side (default: side-by-side) */
  diffMode?: 'inline' | 'sideBySide';
  /** Whether to show the problem panel */
  showProblems?: boolean;
  /** Whether to show the editor minimap */
  showMinimap?: boolean;
  /** Callback when a diagnostic is clicked */
  onDiagnosticClick?: (diagnostic: Diagnostic) => void;
  /** Callback when editor and monaco instance are ready */
  onEditorMount?: (editor: unknown, monaco: unknown) => void;
}

// ---------------------------------------------------------------------------
// Word count helper (status bar)
// ---------------------------------------------------------------------------
function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  // Split on whitespace; ignore empty runs.
  return t.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_MAP = {
  error: { monaco: 8, color: '#ef4444', icon: '✕', label: 'Error' },
  warning: { monaco: 4, color: '#eab308', icon: '⚠', label: 'Warning' },
  info: { monaco: 2, color: '#3b82f6', icon: 'ℹ', label: 'Info' },
  hint: { monaco: 1, color: '#22c55e', icon: '💡', label: 'Hint' },
} as const;

// ---------------------------------------------------------------------------
// Problem Panel Component
// ---------------------------------------------------------------------------

function ProblemPanel({
  diagnostics,
  onDiagnosticClick,
}: {
  diagnostics: Diagnostic[];
  onDiagnosticClick?: (d: Diagnostic) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? diagnostics : diagnostics.filter((d) => d.severity === filter)),
    [diagnostics, filter],
  );

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0, hint: 0 };
    for (const d of diagnostics) c[d.severity]++;
    return c;
  }, [diagnostics]);

  if (diagnostics.length === 0) return null;

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-tertiary)',
        maxHeight: '180px',
        overflow: 'auto',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 12px',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-tertiary)',
          zIndex: 1,
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Problems</span>
        {(['all', 'error', 'warning', 'info'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'rgba(167,139,250,0.2)' : 'transparent',
              border: `1px solid ${filter === f ? 'rgba(167,139,250,0.4)' : 'transparent'}`,
              borderRadius: '3px',
              padding: '1px 8px',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? `All (${diagnostics.length})` : `${f} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Diagnostic rows */}
      {filtered.map((d, i) => {
        const sev = SEVERITY_MAP[d.severity];
        return (
          <div
            key={i}
            onClick={() => onDiagnosticClick?.(d)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '3px 12px',
              gap: '8px',
              cursor: onDiagnosticClick ? 'pointer' : 'default',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}
          >
            <span style={{ color: sev.color, flexShrink: 0, width: '14px', textAlign: 'center' }}>
              {sev.icon}
            </span>
            <span style={{ color: 'var(--text-primary)', flex: 1 }}>{d.message}</span>
            {d.source && (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0 }}>
                {d.source}
              </span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0 }}>
              Ln {d.line}, Col {d.column}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code Editor Component
// ---------------------------------------------------------------------------

function CodeEditorInner({
  value,
  language = 'typescript',
  onChange,
  readOnly = false,
  diagnostics = [],
  originalValue,
  diffMode = 'sideBySide',
  showProblems = true,
  showMinimap = false,
  onDiagnosticClick,
  onEditorMount,
}: CodeEditorProps) {
  const { t } = useTranslation();

  const editorRef = useRef<unknown>(null);
  const monacoRef = useRef<unknown>(null);

  useEffect(() => {
    const monaco = monacoRef.current as {
      editor?: { setModelMarkers: (model: unknown, owner: string, markers: unknown[]) => void };
      MarkerSeverity?: Record<string, number>;
    } | null;
    const editor = editorRef.current as { getModel?: () => unknown } | null;
    if (!monaco?.editor || !editor?.getModel) return;

    const model = editor.getModel();
    if (!model) return;

    const markers = diagnostics.map((d) => ({
      severity:
        d.severity === 'error' ? 8 : d.severity === 'warning' ? 4 : d.severity === 'info' ? 2 : 1,
      message: d.message,
      source: d.source,
      code: d.code,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.line,
      endColumn: d.endColumn ?? d.column + 1,
    }));

    monaco.editor.setModelMarkers(model, 'ghita', markers);
  }, [diagnostics]);

  // Standard editor mount handler
  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      ensureGhitaDarkTheme(monaco);
      MonacoLspBridge.registerProviders(monaco as unknown as Monaco);
      onEditorMount?.(editor, monaco);
      editor.focus();
    },
    [onEditorMount],
  );

  // Diff editor mount handler
  const handleDiffMount: DiffOnMount = useCallback(
    (diffEditor, monaco) => {
      editorRef.current = diffEditor;
      monacoRef.current = monaco;
      ensureGhitaDarkTheme(monaco);
      onEditorMount?.(diffEditor, monaco);
    },
    [onEditorMount],
  );

  const isLoading = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--accent-primary)',
        fontFamily: 'var(--font-sans)',
        gap: '8px',
      }}
    >
      <span className="animate-pulse">⚡</span>
      {t('codeEditor.loading')}
    </div>
  );

  // v0.7.0 — read editor preferences from the global store
  const storeFontSize = useAppStore((s) => s.editorFontSize);
  const storeWordWrap = useAppStore((s) => s.editorWordWrap);
  const storeMinimap = useAppStore((s) => s.editorMinimap);
  const storeLineNumbers = useAppStore((s) => s.editorLineNumbers);
  const storeTabSize = useAppStore((s) => s.editorTabSize);
  // v1.0.0 — Low-RAM mode turns off the eye-candy that costs memory/CPU.
  const lowRamMode = useAppStore((s) => s.lowRamMode);

  const editorOptions = {
    readOnly,
    minimap: { enabled: lowRamMode ? false : (showMinimap ?? storeMinimap) },
    fontSize: storeFontSize,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontLigatures: !lowRamMode,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderWhitespace: 'selection' as const,
    bracketPairColorization: { enabled: true },
    padding: { top: 12 },
    smoothScrolling: !lowRamMode,
    // v1.0.0 fix (lỗi 3 — cursor không hiển thị): `smooth` blinking and the
    // smooth caret animation are unreliable in WebView2 and could leave the
    // caret invisible. Use the classic `blink` caret (solid in low-RAM mode),
    // widen it slightly, and always render the line highlight so the user can
    // always see where the caret is.
    cursorBlinking: (lowRamMode ? 'solid' : 'blink') as 'solid' | 'blink',
    cursorSmoothCaretAnimation: 'off' as const,
    cursorWidth: 2,
    wordWrap: (storeWordWrap ? 'on' : 'off') as 'on' | 'off',
    lineNumbers: (storeLineNumbers ? 'on' : 'off') as 'on' | 'off',
    tabSize: storeTabSize,
    insertSpaces: true,
    lineHeight: 22,
    roundedSelection: !lowRamMode,
    renderLineHighlightOnlyWhenFocus: false,
  };

  // Track cursor position for the status bar (v1.0.0). These hooks MUST live
  // above the diff-view early return so they run on every render.
  // deep-review fix (BUG-10): kept in state (not a ref read during render) —
  // reading a ref in JSX is a side-effect-prone anti-pattern. The functional
  // updater bails out when the position is unchanged so cursor movement does
  // not cause useless re-renders.
  const [cursor, setCursor] = useState({ line: 1, column: 1, selected: 0 });
  useEffect(() => {
    const editor = editorRef.current as {
      onDidChangeCursorPosition?: (cb: () => void) => unknown;
      onDidChangeCursorSelection?: (cb: () => void) => unknown;
      getPosition?: () => { lineNumber: number; column: number };
      getSelection?: () => { getSelectedText?: () => string };
    } | null;
    if (!editor) return;
    const notify = () => {
      const pos = editor.getPosition?.();
      const sel = editor.getSelection?.();
      const line = pos?.lineNumber ?? 1;
      const column = pos?.column ?? 1;
      const selected = sel?.getSelectedText?.().length ?? 0;
      setCursor((prev) =>
        prev.line === line && prev.column === column && prev.selected === selected
          ? prev
          : { line, column, selected },
      );
    };
    const d1 = editor.onDidChangeCursorPosition?.(notify);
    const d2 = editor.onDidChangeCursorSelection?.(notify);
    return () => {
      (d1 as { dispose?: () => void } | undefined)?.dispose?.();
      (d2 as { dispose?: () => void } | undefined)?.dispose?.();
    };
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rootRef.current) return;
    const ro = new ResizeObserver(() => {
      if (editorRef.current) {
        try {
          (editorRef.current as { layout?: () => void }).layout?.();
        } catch {
          // ignore layout errors during unmount/dispose
        }
      }
    });
    ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, []);

  // --- Diff View Mode ---
  if (originalValue !== undefined) {
    return (
      <div
        ref={rootRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Diff header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 12px',
            gap: '8px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#ef4444' }}>◀ Original</span>
          <span>vs</span>
          <span style={{ color: '#22c55e' }}>Modified ▶</span>
          <span style={{ marginLeft: 'auto' }}>
            {diffMode === 'inline' ? 'Inline' : 'Side-by-side'}
          </span>
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <DiffEditor
            height="100%"
            width="100%"
            language={language}
            original={originalValue}
            modified={value}
            theme="ghita-dark"
            onMount={handleDiffMount}
            loading={isLoading}
            options={{
              readOnly: true,
              automaticLayout: true,
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              renderSideBySide: diffMode === 'sideBySide',
              originalEditable: false,
            }}
          />
        </div>

        {showProblems && diagnostics.length > 0 && (
          <ProblemPanel diagnostics={diagnostics} onDiagnosticClick={onDiagnosticClick} />
        )}
      </div>
    );
  }

  // --- Standard Editor Mode ---
  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <Editor
          height="100%"
          width="100%"
          language={language}
          value={value}
          onChange={(v) => onChange?.(v ?? '')}
          onMount={handleMount}
          theme="ghita-dark"
          options={editorOptions}
          loading={isLoading}
        />
      </div>

      {/* v1.0.0 — Editor status bar: cursor pos + word count. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '2px 10px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-tertiary)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          userSelect: 'none',
          flexShrink: 0,
          height: '22px',
        }}
      >
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        {cursor.selected > 0 && (
          <span style={{ color: 'var(--accent-primary)' }}>(Sel {cursor.selected})</span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {t('codeView.words')}: {wordCount(value)}
        </span>
      </div>

      {showProblems && diagnostics.length > 0 && (
        <ProblemPanel diagnostics={diagnostics} onDiagnosticClick={onDiagnosticClick} />
      )}
    </div>
  );
}

// React.memo to prevent double-mount issues in StrictMode
export const CodeEditor = memo(CodeEditorInner);
