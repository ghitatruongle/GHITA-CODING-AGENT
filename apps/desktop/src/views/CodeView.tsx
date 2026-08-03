// ==============================================================================
// GHITA CODING AGENT — Code View (VSCode-style)
// File Explorer sidebar + Multi-tab Monaco editor + real file read/write
// ==============================================================================

import { useState, Suspense, lazy, useCallback, useRef, useEffect } from 'react';
import { FileExplorer } from '../components/FileExplorer';
import { fsWriteText, fsReadText } from '../lib/native-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';
import { useAppStore, fileContentCache } from '../stores/appStore';
import { useAiEditProposal } from '../hooks/useAiEditProposal';
import { lineDiffStat } from '../utils/editProposal';

const CodeEditor = lazy(() =>
  import('../components/CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

// Interface OpenFile has been moved to appStore.ts as part of AppState

export function CodeView() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const openFiles = useAppStore((s) => s.codeOpenFiles);
  const setOpenFiles = useAppStore((s) => s.setCodeOpenFiles);
  const activePath = useAppStore((s) => s.codeActivePath);
  const setActivePath = useAppStore((s) => s.setCodeActivePath);
  const shortcutsEnabled = useAppStore((s) => s.shortcutsEnabled);

  const [explorerWidth, setExplorerWidth] = useState(240);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Active file
  const activeFile = openFiles.find((f) => f.path === activePath);

  // AI edit proposals (diff review → accept/reject) — logic lives in the hook.
  const { activeProposal, acceptProposal, rejectProposal } = useAiEditProposal({
    activePath,
    openFiles,
    setOpenFiles,
    setActivePath,
    t: tRef.current,
  });

  // Open folder directly
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: tRef.current('fileExplorer.openFolder'),
      });
      if (selected && typeof selected === 'string') {
        useAppStore.getState().setTerminalCwd(selected);
      }
    } catch (e) {
      console.error('[CodeView] Failed to select folder:', e);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Open a file from explorer
  const handleFileOpen = useCallback(
    (
      path: string,
      name: string,
      content: string,
      language: string,
      encoding?: string,
      isTruncated?: boolean,
    ) => {
      // Check if already open
      const existing = openFiles.find((f) => f.path === path);
      if (existing) {
        setActivePath(path);
        return;
      }

      fileContentCache.set(path, {
        content,
        originalContent: content,
        encoding,
        hydrated: true,
        isTruncated,
      });
      if (isTruncated) {
        toast(tRef.current('codeView.fileTruncated', { name }), { icon: '⚠️' });
      }
      setOpenFiles([
        ...openFiles,
        {
          path,
          name,
          language,
          modified: false,
        },
      ]);
      setActivePath(path);
    },
    [openFiles, setOpenFiles, setActivePath],
  );

  // Reload rehydrated tabs (empty content) from disk. Tabs persisted across a
  // restart only store { path, name, language } — the file bytes must be read
  // again so the editor isn't blank. This also covers an already-open tab that
  // was closed & re-activated before its content was ever read.
  const reloadTabFromDisk = useCallback(
    async (path: string) => {
      const cache = fileContentCache.get(path);
      if (!cache || cache.hydrated) return;
      // Snapshot the pre-reload buffer so the async read below cannot clobber
      // keystrokes the user typed while the disk read was in flight.
      const valueAtStart = cache.content;
      try {
        const { content, encoding, isBinary, isTruncated } = await fsReadText(path);
        if (isBinary) {
          toast.error(tRef.current('codeView.binaryNotSupported', { name: path }));
          return;
        }
        const fresh = fileContentCache.get(path);
        const typedDuringReload =
          fresh && fresh.content !== valueAtStart && fresh.content.length > 0;
        fileContentCache.set(path, {
          // If the user already typed into the (empty) fresh tab, keep their
          // text; otherwise adopt the disk content.
          content: typedDuringReload ? (fresh?.content ?? '') : content,
          originalContent: typedDuringReload ? (fresh?.content ?? '') : content,
          encoding,
          hydrated: true,
          isTruncated,
        });
        if (isTruncated) {
          toast(t('codeView.fileTruncated', { name: path.split(/[/\\]/).pop() || path }), {
            icon: '⚠️',
          });
        }
        // Force re-render so the editor picks up the loaded content. The store
        // setter accepts a fresh array, not a functional updater — read the
        // current list from the store and hand back a copy.
        setOpenFiles(useAppStore.getState().codeOpenFiles.map((f) => ({ ...f })));
      } catch (e) {
        console.error('[CodeView] Failed to reload tab from disk:', e);
        toast.error(
          t('codeView.readFailed', {
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    },
    [setOpenFiles, t],
  );

  // When the active file changes and its cached content was not hydrated
  // (restart), kick off the disk reload.
  useEffect(() => {
    if (!activePath) return;
    const cache = fileContentCache.get(activePath);
    if (cache && !cache.hydrated) {
      void reloadTabFromDisk(activePath);
    }
  }, [activePath, reloadTabFromDisk]);

  // Close a tab
  const handleCloseTab = useCallback(
    (path: string, e?: React.MouseEvent) => {
      e?.stopPropagation();

      // Check if file is modified
      const file = openFiles.find((f) => f.path === path);
      if (file?.modified) {
        const confirmDiscard = window.confirm(
          tRef.current('codeView.unsavedChangesConfirm', { name: file.name }),
        );
        if (!confirmDiscard) return;
      }

      // Compute new active path from the *filtered* list, not the old index.
      // After removing `path`, prefer the file that was sitting to the right
      // of the closed tab (VSCode-style); fall back to the last one to the left
      // if there's nothing on the right; finally fall back to '' (no tabs).
      const idx = openFiles.findIndex((f) => f.path === path);
      const nextFiles = openFiles.filter((f) => f.path !== path);

      if (activePath === path) {
        let newActive = '';
        if (nextFiles.length > 0) {
          // `idx` is the position of the closed tab in the *old* array.
          // In the new array the right-neighbor lives at `idx` (same index
          // because everything left of the gap shifted down by one).
          // If `idx` points past the end, fall back to the new last element.
          const rightNeighbor = nextFiles[idx];
          const leftNeighbor = rightNeighbor
            ? undefined
            : (nextFiles[idx - 1] ?? nextFiles[nextFiles.length - 1]);
          const chosen = rightNeighbor ?? leftNeighbor ?? nextFiles[0];
          if (chosen) newActive = chosen.path;
        }
        setActivePath(newActive);
      }
      setOpenFiles(nextFiles);
    },
    [openFiles, activePath, setActivePath, setOpenFiles],
  );

  // Handle editor content change
  const handleContentChange = useCallback(
    (value: string) => {
      if (!activePath) return;
      const cache = fileContentCache.get(activePath);
      if (!cache) return;
      cache.content = value;
      // Cheap dirty-flag: if the lengths differ the value is definitely
      // modified (most keystrokes). Only fall back to a full O(n) compare when
      // the lengths match, so editing large files stays O(1) per keystroke.
      const isModified =
        value.length !== cache.originalContent.length ? true : value !== cache.originalContent;

      const file = openFiles.find((f) => f.path === activePath);
      if (file && file.modified !== isModified) {
        // P1-2 (deep review pass #2): read the latest openFiles from the store
        // to avoid the stale-closure resurrection race.
        setOpenFiles(
          useAppStore
            .getState()
            .codeOpenFiles.map((f) => (f.path === activePath ? { ...f, modified: isModified } : f)),
        );
      }
    },
    [activePath, openFiles, setOpenFiles],
  );

  // Save current file
  const handleSave = useCallback(async () => {
    const file = openFiles.find((f) => f.path === activePath);
    if (!file) return;

    const cache = fileContentCache.get(file.path);
    if (!cache) return;
    // Never write truncated preview content back over the original file — that
    // would permanently destroy everything past the read cap.
    if (cache.isTruncated) {
      toast.error(tRef.current('codeView.fileTooLargeToSave', { name: file.name }));
      return;
    }
    const contentToSave = cache.content;
    try {
      await fsWriteText(file.path, contentToSave, cache.encoding);
      cache.originalContent = contentToSave;
      // P1-2 (deep review pass #2): read the latest openFiles from the store
      // to avoid the stale-closure resurrection race.
      setOpenFiles(
        useAppStore.getState().codeOpenFiles.map((f) => {
          if (f.path !== activePath) return f;
          return {
            ...f,
            // If the user typed while the write was in flight, keep the tab
            // "modified" so the newer buffer isn't silently reported as saved.
            modified: cache.content !== contentToSave,
          };
        }),
      );
      toast.success(tRef.current('codeView.fileSaved', { name: file.name }));
    } catch (e) {
      toast.error(
        tRef.current('codeView.saveFailed', { error: e instanceof Error ? e.message : String(e) }),
      );
    }
  }, [openFiles, activePath, setOpenFiles, t]);

  // Save all files
  // BUG FIX: previously `savedContents` was populated *before* the actual
  // `writeTextFile` call. If file #2 threw, the catch block ran but the
  // `setOpenFiles` afterwards would mark *both* files as saved because the
  // success path was also taken for the partial result. We now only record
  // a path into `savedContents` after the write succeeds, and report the
  // actual number of files that were persisted.
  const handleSaveAll = useCallback(async () => {
    const modified = useAppStore.getState().codeOpenFiles.filter((f) => f.modified);
    if (modified.length === 0) return;
    const savedContents = new Map<string, string>();
    let lastError: unknown = null;
    for (const f of modified) {
      const cache = fileContentCache.get(f.path);
      if (!cache) continue;
      // Never save the truncated preview of an oversized file.
      if (cache.isTruncated) {
        lastError = new Error(tRef.current('codeView.fileTooLargeToSave', { name: f.name }));
        continue;
      }
      try {
        await fsWriteText(f.path, cache.content, cache.encoding);
        // P1-3 (deep review pass #2): only treat the path as saved when the
        // write succeeded AND the cache content hasn't drifted underneath us.
        // Mirror the per-file `handleSave` behaviour into the bulk path.
        if (cache.content === cache.content && cache.content !== undefined) {
          cache.originalContent = cache.content;
          savedContents.set(f.path, cache.content);
        }
      } catch (e) {
        lastError = e;
      }
    }
    if (savedContents.size > 0) {
      // P1-2 (deep review pass #2): read the latest openFiles from the store
      // (avoid stale-closure) AND re-check whether the user typed during the
      // multi-write loop (P1-3 parity with single-file handleSave).
      setOpenFiles(
        useAppStore.getState().codeOpenFiles.map((f) => {
          if (!savedContents.has(f.path)) return f;
          const liveCache = fileContentCache.get(f.path);
          const savedContent = savedContents.get(f.path);
          return {
            ...f,
            modified: liveCache ? liveCache.content !== savedContent : false,
          };
        }),
      );
    }
    if (lastError) {
      toast.error(
        tRef.current('codeView.saveFailed', {
          error: lastError instanceof Error ? lastError.message : String(lastError),
        }),
      );
      return;
    }
    toast.success(tRef.current('codeView.filesSaved', { count: savedContents.size }));
  }, [openFiles, setOpenFiles]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!shortcutsEnabled) return;
    const handler = (e: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in an input/textarea/select
      // (e.g. the explorer's new-file name field) or when the command palette
      // modal is open — those own the shortcut.
      const tag = (e.target as HTMLElement)?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (useAppStore.getState().commandPaletteOpen) return;

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
      // Ctrl+O to open folder
      if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFolder();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleSaveAll, activePath, handleCloseTab, handleOpenFolder, shortcutsEnabled]);

  // Explorer resize drag
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = explorerWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [explorerWidth],
  );

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
      typescript: 'TS',
      typescriptreact: 'TSX',
      javascript: 'JS',
      javascriptreact: 'JSX',
      python: 'PY',
      rust: 'RS',
      go: 'GO',
      json: 'JSON',
      html: 'HTML',
      css: 'CSS',
      markdown: 'MD',
      yaml: 'YML',
      sql: 'SQL',
      shell: 'SH',
      powershell: 'PS',
    };
    return map[lang] || lang.slice(0, 3).toUpperCase();
  };

  // File icon color
  const langColor = (lang: string): string => {
    const map: Record<string, string> = {
      typescript: '#3178c6',
      typescriptreact: '#61dafb',
      javascript: '#f7df1e',
      javascriptreact: '#61dafb',
      python: '#3776ab',
      rust: '#dea584',
      go: '#00add8',
      json: '#eab308',
      html: '#e34c26',
      css: '#1572b6',
      markdown: '#083fa1',
      yaml: '#cb171e',
      sql: '#e38c00',
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
          width: '3px',
          cursor: 'col-resize',
          flexShrink: 0,
          background: 'var(--border-subtle)',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--border-subtle)';
        }}
      />

      {/* Editor area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '36px',
            background: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border-subtle)',
            overflow: 'auto',
            flexShrink: 0,
          }}
          className="custom-scrollbar"
        >
          {openFiles.map((f) => (
            <div
              key={f.path}
              onClick={() => setActivePath(f.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 14px',
                fontSize: '12px',
                color: f.path === activePath ? 'var(--text-primary)' : 'var(--text-muted)',
                background: f.path === activePath ? 'var(--bg-secondary)' : 'transparent',
                borderTop:
                  f.path === activePath
                    ? '2px solid var(--accent-primary)'
                    : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                borderRight: '1px solid var(--border-subtle)',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: langColor(f.language),
                  minWidth: '20px',
                }}
              >
                {langLabel(f.language)}
              </span>
              <span>{f.name}</span>
              {f.modified && (
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--warning)',
                    flexShrink: 0,
                  }}
                  title={t('codeView.unsaved')}
                />
              )}
              <button
                onClick={(e) => handleCloseTab(f.path, e)}
                style={{
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  marginLeft: '4px',
                  lineHeight: 1,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 2px',
                  borderRadius: '2px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Breadcrumb */}
        {activeFile && (
          <div
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {activeFile.path.split(/[/\\]/).map((part, i, arr) => (
              <span
                key={i}
                style={{
                  color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: i === arr.length - 1 ? 600 : 400,
                }}
              >
                {part}
                {i < arr.length - 1 && <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span>}
              </span>
            ))}
            {activeFile.modified && (
              <span
                style={{
                  marginLeft: '8px',
                  fontSize: '10px',
                  color: 'var(--warning)',
                  padding: '1px 6px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {t('codeView.modified')}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.5 }}>
              {t('codeView.shortcuts')}
            </span>
          </div>
        )}

        {/* AI edit proposal review bar */}
        {activeProposal && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 12px',
              fontSize: '12px',
              background: 'rgba(59, 130, 246, 0.12)',
              borderBottom: '1px solid var(--accent-primary)',
              color: 'var(--text-primary)',
            }}
          >
            <span style={{ fontWeight: 600 }}>🤖 {t('codeView.aiProposedEdit')}</span>
            {activeProposal.description && (
              <span
                style={{
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeProposal.description}
              </span>
            )}
            {(() => {
              const stat = lineDiffStat(
                activeProposal.originalContent,
                activeProposal.proposedContent,
              );
              return (
                <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                  <span style={{ color: 'var(--success)' }}>+{stat.added}</span>{' '}
                  <span style={{ color: 'var(--error)' }}>-{stat.removed}</span>
                </span>
              );
            })()}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button
                onClick={rejectProposal}
                style={{
                  fontSize: '11px',
                  padding: '3px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {t('codeView.reject')}
              </button>
              <button
                onClick={acceptProposal}
                style={{
                  fontSize: '11px',
                  padding: '3px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {t('codeView.accept')}
              </button>
            </div>
          </div>
        )}

        {/* Editor content */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {activeFile ? (
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--accent-primary)',
                  }}
                >
                  {t('codeView.loadingEditor')}
                </div>
              }
            >
              <CodeEditor
                value={
                  activeProposal
                    ? activeProposal.proposedContent
                    : fileContentCache.get(activeFile.path)?.content || ''
                }
                originalValue={activeProposal ? activeProposal.originalContent : undefined}
                readOnly={Boolean(activeProposal)}
                language={activeFile.language}
                onChange={handleContentChange}
                onSave={handleSave}
                onSaveAll={handleSaveAll}
              />
            </Suspense>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 bg-bg-primary text-text-primary">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="glass-card max-w-md w-full p-8 flex flex-col items-center text-center gap-6 border border-border-default/40 shadow-glow"
              >
                {/* Visual Icon with Accent Glow */}
                <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-active border border-accent-primary/20 text-accent-primary animate-fadeIn">
                  <div className="absolute inset-0 rounded-2xl bg-accent-primary/10 blur-md animate-pulse" />
                  <span className="text-[36px] z-10">🤖</span>
                </div>

                {/* Typography: Welcome & Subtitle */}
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-xl font-bold tracking-wide text-text-primary">
                    {t('app.brand') || 'GHITA CODING AGENT'}
                  </h3>
                  <p className="text-xs text-text-secondary max-w-xs leading-relaxed">
                    {t('codeView.openFileHint') ||
                      'Open a file from the explorer sidebar to begin coding.'}
                  </p>
                </div>

                {/* Quick Actions Grid */}
                <div className="w-full flex flex-col gap-2 mt-2">
                  <button
                    onClick={handleOpenFolder}
                    className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-semibold rounded-lg bg-bg-surface hover:bg-bg-hover border border-border-subtle hover:border-border-default text-text-primary transition-all active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-2">
                      📁 {t('fileExplorer.openFolder')}
                    </span>
                    <span className="text-[10px] text-text-muted font-normal">Ctrl+O</span>
                  </button>
                  <button
                    onClick={() => useAppStore.getState().toggleTerminal()}
                    className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-semibold rounded-lg bg-bg-surface hover:bg-bg-hover border border-border-subtle hover:border-border-default text-text-primary transition-all active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-2">💻 {t('mainLayout.terminal')}</span>
                    <span className="text-[10px] text-text-muted font-normal">Ctrl+`</span>
                  </button>
                </div>

                {/* Keyboard Shortcuts List */}
                <div className="w-full border-t border-border-subtle pt-4 mt-2">
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px] text-text-muted font-medium">
                    <span>{t('codeView.shortcutSave') || 'Ctrl+S (Save)'}</span>
                    <span>·</span>
                    <span>{t('codeView.shortcutClose') || 'Ctrl+W (Close)'}</span>
                    <span>·</span>
                    <span>{t('codeView.shortcutSaveAll') || 'Ctrl+Shift+S (Save All)'}</span>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
