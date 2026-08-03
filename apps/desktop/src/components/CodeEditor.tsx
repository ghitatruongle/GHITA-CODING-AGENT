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
}: CodeEditorProps) {
  const { t } = useTranslation();

  const editorRef = useRef<unknown>(null);
  const monacoRef = useRef<unknown>(null);

  // Apply diagnostics as Monaco model markers
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
    // P2-4 (deep review pass #2): markers attach to the Monaco model, not to
    // the `value` prop. Removing `value` from the deps avoids re-running
    // setModelMarkers on every keystroke.
  }, [diagnostics]);

  // Standard editor mount handler
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // P2-3 (deep review pass #2): registers the theme on the first mount,
    // then setTheme on every mount. See ensureGhitaDarkTheme above.
    ensureGhitaDarkTheme(monaco);

    // NOTE: Ctrl+S / Ctrl+Shift+S are intentionally NOT registered here.
    // CodeView owns a single window-level keydown handler for save/save-all;
    // adding a second Monaco-level binding fired the same handler twice,
    // producing duplicate toasts and double writes.

    editor.focus();
  }, []);

  // Diff editor mount handler
  const handleDiffMount: DiffOnMount = useCallback((diffEditor, monaco) => {
    editorRef.current = diffEditor;
    monacoRef.current = monaco;
    ensureGhitaDarkTheme(monaco);
  }, []);

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

  const editorOptions = {
    readOnly,
    minimap: { enabled: showMinimap ?? storeMinimap },
    fontSize: storeFontSize,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontLigatures: true,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderWhitespace: 'selection' as const,
    bracketPairColorization: { enabled: true },
    padding: { top: 12 },
    smoothScrolling: true,
    cursorBlinking: 'smooth' as const,
    cursorSmoothCaretAnimation: 'on' as const,
    wordWrap: (storeWordWrap ? 'on' : 'off') as 'on' | 'off',
    lineNumbers: (storeLineNumbers ? 'on' : 'off') as 'on' | 'off',
    tabSize: storeTabSize,
    insertSpaces: true,
    lineHeight: 22,
    roundedSelection: true,
    renderLineHighlightOnlyWhenFocus: true,
  };

  // --- Diff View Mode ---
  if (originalValue !== undefined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
          }}
        >
          <span style={{ color: '#ef4444' }}>◀ Original</span>
          <span>vs</span>
          <span style={{ color: '#22c55e' }}>Modified ▶</span>
          <span style={{ marginLeft: 'auto' }}>
            {diffMode === 'inline' ? 'Inline' : 'Side-by-side'}
          </span>
        </div>

        <div style={{ flex: 1 }}>
          <DiffEditor
            height="100%"
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          language={language}
          value={value}
          onChange={(v) => onChange?.(v ?? '')}
          onMount={handleMount}
          theme="ghita-dark"
          options={editorOptions}
          loading={isLoading}
        />
      </div>

      {showProblems && diagnostics.length > 0 && (
        <ProblemPanel diagnostics={diagnostics} onDiagnosticClick={onDiagnosticClick} />
      )}
    </div>
  );
}

// React.memo to prevent double-mount issues in StrictMode
export const CodeEditor = memo(CodeEditorInner);
