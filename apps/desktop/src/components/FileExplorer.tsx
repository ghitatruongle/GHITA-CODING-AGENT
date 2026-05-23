// ==============================================================================
// GHITA CODING AGENT — File Explorer (VSCode-style sidebar)
// Browse folders, expand/collapse, click to open files
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { readDir, readTextFile, mkdir, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from '../i18n';

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

export function detectLanguage(filename: string): string {
  const ext = filename.lastIndexOf('.') >= 0 ? filename.slice(filename.lastIndexOf('.')) : '';
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
        children: entry.isDirectory ? undefined : undefined,
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
  const [rootDir, setRootDir] = useState(rootPath || '');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null);

  // Load root directory
  useEffect(() => {
    if (rootPath) {
      setRootDir(rootPath);
      loadRoot(rootPath);
    }
  }, [rootPath]);

  const loadRoot = async (dir: string) => {
    setLoading(true);
    const entries = await loadDirectory(dir);
    setRootEntries(entries);
    setTree(new Map());
    setLoading(false);
  };

  const toggleFolder = useCallback(async (path: string) => {
    setTree((prev) => {
      const next = new Map(prev);
      if (next.has(path)) {
        // Collapse
        next.delete(path);
        return next;
      }
      return prev;
    });

    // If not loaded yet, load children
    if (!tree.has(path)) {
      const children = await loadDirectory(path);
      setTree((prev) => {
        const next = new Map(prev);
        next.set(path, children);
        return next;
      });
    }
  }, [tree]);

  const handleFileClick = useCallback(async (entry: FileEntry) => {
    try {
      const content = await readTextFile(entry.path);
      const lang = detectLanguage(entry.name);
      onFileOpen(entry.path, entry.name, content, lang);
    } catch (e) {
      console.error('[FileExplorer] Failed to read file:', e);
    }
  }, [onFileOpen]);

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
    }
  }, []);

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
      setTree((prev) => {
        const next = new Map(prev);
        next.set(parentDir, children);
        return next;
      });
    } catch (e) {
      console.error('[FileExplorer] Failed to create file:', e);
    }
    setContextMenu(null);
  }, []);

  const handleNewFolder = useCallback(async (dirPath: string) => {
    const name = prompt(t('fileExplorer.newFolderPrompt'));
    if (!name) return;
    const folderPath = dirPath + '/' + name;
    try {
      await mkdir(folderPath, { recursive: true });
      const parentDir = dirPath;
      const children = await loadDirectory(parentDir);
      setTree((prev) => {
        const next = new Map(prev);
        next.set(parentDir, children);
        return next;
      });
    } catch (e) {
      console.error('[FileExplorer] Failed to create folder:', e);
    }
    setContextMenu(null);
  }, []);

  const handleDelete = useCallback(async (path: string) => {
    if (!confirm(t('fileExplorer.deleteConfirm', { name: path.split('/').pop() || '' }))) return;
    try {
      await remove(path, { recursive: true });
      // Reload parent
      const parts = path.split('/');
      parts.pop();
      const parentDir = parts.join('/');
      if (parentDir === rootDir) {
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
    }
    setContextMenu(null);
  }, [rootDir]);

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
