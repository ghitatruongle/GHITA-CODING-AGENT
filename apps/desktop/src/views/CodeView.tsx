// ==============================================================================
// GHITA CODING AGENT — Code View (VSCode-style)
// File Explorer sidebar + Multi-tab Monaco editor + real file read/write
// ==============================================================================

import { useState, Suspense, lazy, useCallback, useRef, useEffect } from 'react';
import { FileExplorer } from '../components/FileExplorer';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import toast from 'react-hot-toast';

const CodeEditor = lazy(() =>
  import('../components/CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string; // For dirty detection
  language: string;
  modified: boolean;
}

export function CodeView() {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string>('');
  const [explorerWidth, setExplorerWidth] = useState(240);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Active file
  const activeFile = openFiles.find((f) => f.path === activePath);

  // Open a file from explorer
  const handleFileOpen = useCallback((path: string, name: string, content: string, language: string) => {
    // Check if already open
    const existing = openFiles.find((f) => f.path === path);
    if (existing) {
      setActivePath(path);
      return;
    }

    setOpenFiles((prev) => [...prev, {
      path, name, content,
      originalContent: content,
      language,
      modified: false,
    }]);
    setActivePath(path);
  }, [openFiles]);

  // Close a tab
  const handleCloseTab = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activePath === path) {
        const idx = prev.findIndex((f) => f.path === path);
        const newActive = next[Math.min(idx, next.length - 1)]?.path || '';
        setActivePath(newActive);
      }
      return next;
    });
  }, [activePath]);

  // Handle editor content change
  const handleContentChange = useCallback((value: string) => {
    if (!activePath) return;
    setOpenFiles((prev) => prev.map((f) =>
      f.path === activePath
        ? { ...f, content: value, modified: value !== f.originalContent }
        : f,
    ));
  }, [activePath]);

  // Save current file
  const handleSave = useCallback(async () => {
    if (!activeFile) return;
    try {
      await writeTextFile(activeFile.path, activeFile.content);
      setOpenFiles((prev) => prev.map((f) =>
        f.path === activePath
          ? { ...f, originalContent: f.content, modified: false }
          : f,
      ));
      toast.success(`Đã lưu: ${activeFile.name}`);
    } catch (e) {
      toast.error(`Lưu thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [activeFile, activePath]);

  // Save all files
  const handleSaveAll = useCallback(async () => {
    const modified = openFiles.filter((f) => f.modified);
    if (modified.length === 0) return;
    try {
      for (const f of modified) {
        await writeTextFile(f.path, f.content);
      }
      setOpenFiles((prev) => prev.map((f) => ({
        ...f, originalContent: f.content, modified: false,
      })));
      toast.success(`Đã lưu ${modified.length} file(s)`);
    } catch (e) {
      toast.error(`Lưu thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [openFiles]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAll();
        } else {
          handleSave();
        }
      }
      // Ctrl+W to close tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activePath) handleCloseTab(activePath);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleSaveAll, activePath, handleCloseTab]);

  // Explorer resize drag
  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = explorerWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [explorerWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      setExplorerWidth(Math.max(160, Math.min(500, startWidth.current + delta)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Language label
  const langLabel = (lang: string): string => {
    const map: Record<string, string> = {
      typescript: 'TS', typescriptreact: 'TSX',
      javascript: 'JS', javascriptreact: 'JSX',
      python: 'PY', rust: 'RS', go: 'GO',
      json: 'JSON', html: 'HTML', css: 'CSS',
      markdown: 'MD', yaml: 'YML', sql: 'SQL',
      shell: 'SH', powershell: 'PS',
    };
    return map[lang] || lang.slice(0, 3).toUpperCase();
  };

  // File icon color
  const langColor = (lang: string): string => {
    const map: Record<string, string> = {
      typescript: '#3178c6', typescriptreact: '#61dafb',
      javascript: '#f7df1e', javascriptreact: '#61dafb',
      python: '#3776ab', rust: '#dea584', go: '#00add8',
      json: '#eab308', html: '#e34c26', css: '#1572b6',
      markdown: '#083fa1', yaml: '#cb171e', sql: '#e38c00',
    };
    return map[lang] || '#818cf8';
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* File Explorer sidebar */}
      <div style={{ width: explorerWidth, flexShrink: 0, overflow: 'hidden' }}>
        <FileExplorer onFileOpen={handleFileOpen} />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          width: '3px', cursor: 'col-resize', flexShrink: 0,
          background: 'var(--border-subtle)',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; }}
      />

      {/* Editor area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Tab bar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          height: '36px', background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-subtle)',
          overflow: 'auto', flexShrink: 0,
        }} className="custom-scrollbar">
          {openFiles.map((f) => (
            <div
              key={f.path}
              onClick={() => setActivePath(f.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 14px', fontSize: '12px',
                color: f.path === activePath ? 'var(--text-primary)' : 'var(--text-muted)',
                background: f.path === activePath ? 'var(--bg-secondary)' : 'transparent',
                borderTop: f.path === activePath ? '2px solid var(--accent-primary)' : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                borderRight: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{
                fontSize: '10px', fontWeight: 700, color: langColor(f.language),
                minWidth: '20px',
              }}>
                {langLabel(f.language)}
              </span>
              <span>{f.name}</span>
              {f.modified && (
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: 'var(--warning)', flexShrink: 0,
                }} title="Chưa lưu" />
              )}
              <button
                onClick={(e) => handleCloseTab(f.path, e)}
                style={{
                  fontSize: '14px', color: 'var(--text-muted)',
                  marginLeft: '4px', lineHeight: 1,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0 2px', borderRadius: '2px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Breadcrumb */}
        {activeFile && (
          <div style={{
            padding: '4px 12px', fontSize: '11px', color: 'var(--text-muted)',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            {activeFile.path.split(/[/\\]/).map((part, i, arr) => (
              <span key={i} style={{
                color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: i === arr.length - 1 ? 600 : 400,
              }}>
                {part}{i < arr.length - 1 && <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span>}
              </span>
            ))}
            {activeFile.modified && (
              <span style={{
                marginLeft: '8px', fontSize: '10px', color: 'var(--warning)',
                padding: '1px 6px', background: 'rgba(245, 158, 11, 0.1)',
                borderRadius: 'var(--radius-full)',
              }}>
                Modified
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.5 }}>
              Ctrl+S save · Ctrl+Shift+S save all · Ctrl+W close
            </span>
          </div>
        )}

        {/* Editor content */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {activeFile ? (
            <Suspense
              fallback={
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: 'var(--accent-primary)',
                }}>
                  ⚡ Loading editor...
                </div>
              }
            >
              <CodeEditor
                value={activeFile.content}
                language={activeFile.language}
                onChange={handleContentChange}
              />
            </Suspense>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', color: 'var(--text-muted)',
              gap: '12px',
            }}>
              <span style={{ fontSize: '48px', opacity: 0.3 }}>🤖</span>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>GHITA CODING AGENT</span>
              <span style={{ fontSize: '12px', opacity: 0.6 }}>
                Mở file từ Explorer hoặc nhấn Ctrl+N để bắt đầu
              </span>
              <div style={{
                marginTop: '16px', display: 'flex', gap: '12px', fontSize: '11px',
                color: 'var(--text-muted)', opacity: 0.5,
              }}>
                <span>Ctrl+S Save</span>
                <span>·</span>
                <span>Ctrl+W Close</span>
                <span>·</span>
                <span>Ctrl+Shift+S Save All</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
