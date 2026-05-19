// ==============================================================================
// GHITA CODING AGENT — Code Editor (Monaco)
// ==============================================================================

import { memo, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

function CodeEditorInner({ value, language = 'typescript', onChange, readOnly = false }: CodeEditorProps) {
  const handleMount: OnMount = useCallback((editor, monaco) => {
    // Define custom GHITA dark theme
    monaco.editor.defineTheme('ghita-dark', {
      base: 'vs-dark',
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
      },
    });
    monaco.editor.setTheme('ghita-dark');

    // Focus editor
    editor.focus();
  }, []);

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        fontLigatures: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        padding: { top: 12 },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        lineHeight: 22,
        roundedSelection: true,
        renderLineHighlightOnlyWhenFocus: true,
      }}
      loading={
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
          Đang tải editor...
        </div>
      }
    />
  );
}

// React.memo to prevent double-mount issues in StrictMode
export const CodeEditor = memo(CodeEditorInner);
