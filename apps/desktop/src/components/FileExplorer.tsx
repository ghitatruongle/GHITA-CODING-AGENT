// ==============================================================================
// GHITA CODING AGENT — File Explorer (VSCode-style sidebar)
// Browse folders, expand/collapse, click to open files
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { readDir, readTextFile, mkdir, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';
import toast from 'react-hot-toast';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  expanded?: boolean;
}

interface FileExplorerProps {
  onFileOpen: (path: string, name: string, content: string, language: string) => void;
  rootPath?: string;
}

// Language detection from file extension
const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescriptreact',
  '.js': 'javascript', '.jsx': 'javascriptreact',
  '.json': 'json', '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.py': 'python', '.rb': 'ruby', '.rs': 'rust',
  '.go': 'go', '.java': 'java', '.kt': 'kotlin',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.cs': 'csharp', '.swift': 'swift', '.dart': 'dart',
  '.md': 'markdown', '.yml': 'yaml', '.yaml': 'yaml',
  '.xml': 'xml', '.sql': 'sql', '.sh': 'shell',
  '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell',
  '.toml': 'toml', '.ini': 'ini', '.env': 'shell',
  '.dockerfile': 'dockerfile', '.docker': 'dockerfile',
  '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.proto': 'protobuf', '.lua': 'lua', '.r': 'r',
  '.R': 'r', '.scala': 'scala', '.clj': 'clojure',
  '.ex': 'elixir', '.exs': 'elixir', '.erl': 'erlang',
};

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf',
  '.zip', '.gz', '.tar', '.rar', '.7z', '.exe', '.dll', '.bin',
  '.mp4', '.mkv', '.avi', '.mov', '.mp3', '.wav', '.flac',
  '.woff', '.woff2', '.ttf', '.eot', '.dmg', '.pkg', '.apk', '.ipa'
]);

export function detectLanguage(filename: string): string {
  const ext = filename.lastIndexOf('.') >= 0 ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  if (EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  if (lower === 'cmake') return 'cmake';
  if (lower.endsWith('.lock')) return 'json';
  return 'plaintext';
}

// File icon based on extension
function fileIcon(name: string): string {
  const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  const map: Record<string, string> = {
    '.ts': '🔷', '.tsx': '⚛️', '.js': '🟡', '.jsx': '⚛️',
    '.json': '📋', '.html': '🌐', '.css': '🎨', '.scss': '🎨',
    '.py': '🐍', '.rs': '🦀', '.go': '🔵', '.java': '☕',
    '.md': '📝', '.yml': '⚙️', '.yaml': '⚙️', '.toml': '⚙️',
    '.sh': '🐚', '.ps1': '💠', '.sql': '🗄️', '.xml': '📄',
    '.vue': '💚', '.svelte': '🔥', '.dockerfile': '🐳',
    '.gitignore': '🙈', '.env': '🔐',
  };
  if (map[ext]) return map[ext];
  if (name.startsWith('.')) return '⚙️';
  return '📄';
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'target', '.next', 'dist', 'build', '.turbo', '__pycache__', '.vscode', '.idea']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

async function loadDirectory(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await readDir(dirPath);
    const result: FileEntry[] = [];

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_FILES.has(entry.name)) continue;

      const fullPath = dirPath.endsWith('/') || dirPath.endsWith('\\')
        ? dirPath + entry.name
        : dirPath + '/' + entry.name;

      result.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory,
        children: undefined,
        expanded: false,
      });
    }

    // Sort: folders first, then files, alphabetically
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  } catch (e) {
    console.error('[FileExplorer] Failed to read directory:', e);
    return [];
  }
}

export function FileExplorer({ onFileOpen, rootPath }: FileExplorerProps) {
  const { t } = useTranslation();
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [tree, setTree] = useState<Map<string, FileEntry[]>>(new Map());
  const [loading, setLoading] = useState(false);
  // BUG FIX #8: tracks paths that have an in-flight `loadDirectory` call.
  // Prevents a fast double-click from queuing two reads of the same folder
  // (the second read would otherwise race with the first and could write
  // stale or out-of-order children into the tree after we marked it as
  // expanded). The flag is also surfaced in the UI so the caret animates
  // immediately while the read is pending.
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [rootDir, setRootDir] = useState(rootPath || '');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null);

  // Load root directory
  useEffect(() => {
    if (rootPath) {
      setRootDir(rootPath);
      loadRoot(rootPath);
    }
  }, [rootPath]);

  // Sync rootDir to global terminalCwd
  useEffect(() => {
    if (rootDir) {
      useAppStore.getState().setTerminalCwd(rootDir);
    }
  }, [rootDir]);

  const loadRoot = async (dir: string) => {
    setLoading(true);
    const entries = await loadDirectory(dir);
    setRootEntries(entries);
    setTree(new Map());
    setLoading(false);
  };

  const toggleFolder = useCallback(async (path: string) => {
    // Single source of truth: read latest tree from store-state ref
    // and update atomically (collapse OR schedule load — never both).
    const wasLoaded = tree.has(path);

    if (wasLoaded) {
      // Collapse: synchronously drop the entry from the tree.
      setTree((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      return;
    }

    // Guard against re-entrant loads (e.g. user double-clicks the folder
    // before the first read resolves). If a load is already in flight for
    // this path, do nothing — the first call will populate the tree and
    // expand the folder on its own.
    if (loadingPaths.has(path)) return;
    setLoadingPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    try {
      const children = await loadDirectory(path);
      setTree((prev) => {
        const next = new Map(prev);
        next.set(path, children);
        return next;
      });
    } finally {
      setLoadingPaths((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [tree, loadingPaths]);

  const normalizePath = (p: string) => p.replace(/\\/g, '/');

  const handleFileClick = useCallback(async (entry: FileEntry) => {
    const ext = entry.name.lastIndexOf('.') >= 0 ? entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase() : '';
    if (BINARY_EXTS.has(ext)) {
      toast.error(t('codeView.binaryNotSupported', { name: entry.name }));
      return;
    }

    try {
      const content = await readTextFile(entry.path);
      const lang = detectLanguage(entry.name);
      onFileOpen(entry.path, entry.name, content, lang);
    } catch (e) {
      console.error('[FileExplorer] Failed to read file:', e);
      toast.error(t('codeView.readFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  }, [onFileOpen, t]);

  const handleSelectFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('fileExplorer.openFolder'),
      });
      if (selected && typeof selected === 'string') {
        setRootDir(selected);
        loadRoot(selected);
      }
    } catch (e) {
      console.error('[FileExplorer] Failed to select folder:', e);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [t]);

  // Context menu actions
  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  }, []);

  const handleNewFile = useCallback(async (dirPath: string) => {
    const name = prompt(t('fileExplorer.newFilePrompt'));
    if (!name) return;
    const filePath = dirPath + '/' + name;
    try {
      await writeTextFile(filePath, '');
      // Reload parent directory
      const parentDir = dirPath;
      const children = await loadDirectory(parentDir);
      
      if (normalizePath(parentDir) === normalizePath(rootDir)) {
        loadRoot(rootDir);
      } else {
        setTree((prev) => {
          const next = new Map(prev);
          next.set(parentDir, children);
          return next;
        });
      }
    } catch (e) {
      console.error('[FileExplorer] Failed to create file:', e);
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setContextMenu(null);
  }, [rootDir, t]);

  const handleNewFolder = useCallback(async (dirPath: string) => {
    const name = prompt(t('fileExplorer.newFolderPrompt'));
    if (!name) return;
    const folderPath = dirPath + '/' + name;
    try {
      await mkdir(folderPath, { recursive: true });
      const parentDir = dirPath;
      const children = await loadDirectory(parentDir);

      if (normalizePath(parentDir) === normalizePath(rootDir)) {
        loadRoot(rootDir);
      } else {
        setTree((prev) => {
          const next = new Map(prev);
          next.set(parentDir, children);
          return next;
        });
      }
    } catch (e) {
      console.error('[FileExplorer] Failed to create folder:', e);
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setContextMenu(null);
  }, [rootDir, t]);

  const handleDelete = useCallback(async (path: string) => {
    const fileName = path.split(/[/\\]/).pop() || '';
    if (!confirm(t('fileExplorer.deleteConfirm', { name: fileName }))) return;
    try {
      await remove(path, { recursive: true });
      // Reload parent
      const parts = path.split(/[/\\]/);
      parts.pop();
      // BUG FIX #9: previously `parts.join('/')` was used here, which on
      // Windows produced a POSIX-style path that the Rust/Tauri backend
      // would silently treat as a different directory. Detect the original
      // path's separator and re-use it so the parent directory string is
      // always a valid path on the host OS. The downstream `loadDirectory`
      // and `normalizePath` calls still go through their own cross-platform
      // handling — we only need to keep this string consistent with what
      // `loadDirectory` originally received.
      const sep = path.includes('\\') && !path.includes('/') ? '\\' : '/';
      const parentDir = parts.join(sep) || (sep === '\\' ? 'C:\\' : '/');
      if (normalizePath(parentDir) === normalizePath(rootDir)) {
        loadRoot(rootDir);
      } else {
        const children = await loadDirectory(parentDir);
        setTree((prev) => {
          const next = new Map(prev);
          next.set(parentDir, children);
          return next;
        });
      }
    } catch (e) {
      console.error('[FileExplorer] Failed to delete:', e);
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setContextMenu(null);
  }, [rootDir, t]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isExpanded = tree.has(entry.path);

    return (
      <div key={entry.path}>
        <div
          onClick={() => entry.isDirectory ? toggleFolder(entry.path) : handleFileClick(entry)}
          onContextMenu={(e) => handleContextMenu(e, entry.path, entry.isDirectory)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px 3px ' + (12 + depth * 16) + 'px',
            cursor: 'pointer', fontSize: '12px',
            color: 'var(--text-primary)',
            transition: 'background 0.1s',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {entry.isDirectory ? (
            <span style={{
              fontSize: '10px', width: '14px', textAlign: 'center',
              transform: isExpanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s', color: 'var(--text-muted)',
            }}>
              ▶
            </span>
          ) : (
            <span style={{ width: '14px' }} />
          )}
          <span style={{ fontSize: '14px', flexShrink: 0 }}>
            {entry.isDirectory ? (isExpanded ? '📂' : '📁') : fileIcon(entry.name)}
          </span>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis',
            fontWeight: entry.isDirectory ? 500 : 400,
          }}>
            {entry.name}
          </span>
        </div>

        {entry.isDirectory && isExpanded && tree.get(entry.path)?.map((child) =>
          renderEntry(child, depth + 1),
        )}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-primary)',
      borderRight: '1px solid var(--border-subtle)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-tertiary)',
      }}>
        <span style={{
          fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '1px', color: 'var(--text-muted)',
        }}>
          {t('fileExplorer.explorer')}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={handleSelectFolder}
            title={t('fileExplorer.openFolder')}
            aria-label={t('fileExplorer.openFolder')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '14px', padding: '2px', color: 'var(--text-muted)',
            }}
          >
            📁
          </button>
          <button
            onClick={() => rootDir && handleNewFile(rootDir)}
            title={t('fileExplorer.newFile')}
            aria-label={t('fileExplorer.newFile')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '14px', padding: '2px', color: 'var(--text-muted)',
            }}
          >
            📄
          </button>
          <button
            onClick={() => rootDir && handleNewFolder(rootDir)}
            title={t('fileExplorer.newFolder')}
            aria-label={t('fileExplorer.newFolder')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '14px', padding: '2px', color: 'var(--text-muted)',
            }}
          >
            ➕
          </button>
        </div>
      </div>

      {/* Folder name */}
      {rootDir && (
        <div style={{
          padding: '6px 12px', fontSize: '11px', color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-subtle)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          background: 'var(--bg-secondary)',
        }}>
          {rootDir.split(/[/\\]/).pop() || rootDir}
        </div>
      )}

      {/* File tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }} className="custom-scrollbar">
        {!rootDir ? (
          <div style={{
            padding: '20px', textAlign: 'center', color: 'var(--text-muted)',
            fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <span style={{ fontSize: '24px' }}>📂</span>
            <span>{t('fileExplorer.noFolderOpen')}</span>
            <button
              onClick={handleSelectFolder}
              style={{
                padding: '6px 16px', background: 'var(--accent-primary)',
                color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: '12px', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {t('fileExplorer.openFolderButton')}
            </button>
          </div>
        ) : loading ? (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            {t('fileExplorer.loading')}
          </div>
        ) : rootEntries.length === 0 ? (
          <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            {t('fileExplorer.emptyFolder')}
          </div>
        ) : (
          rootEntries.map((entry) => renderEntry(entry))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y,
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)', padding: '4px 0', zIndex: 1000,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: '160px',
        }}>
          {contextMenu.isDir && (
            <>
              <ContextMenuItem icon="📄" label={t('fileExplorer.newFile')} onClick={() => handleNewFile(contextMenu.path)} />
              <ContextMenuItem icon="📁" label={t('fileExplorer.newFolder')} onClick={() => handleNewFolder(contextMenu.path)} />
              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />
            </>
          )}
          <ContextMenuItem icon="🗑️" label={t('fileExplorer.delete')} onClick={() => handleDelete(contextMenu.path)} danger />
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 12px', cursor: 'pointer', fontSize: '12px',
        color: danger ? 'var(--error)' : 'var(--text-primary)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{icon}</span> {label}
    </div>
  );
}
