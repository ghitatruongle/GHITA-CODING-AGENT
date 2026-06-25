// ==============================================================================
// GHITA CODING AGENT — File Explorer (Composition Root)
// State management, directory loading, event handlers
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { readDir, readTextFile, mkdir, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from '../i18n';
import { useAppStore } from '../stores/appStore';
import toast from 'react-hot-toast';
import { FileExplorerToolbar } from './file-explorer/FileExplorerToolbar';
import { FileTree } from './file-explorer/FileTree';
import {
  type FileEntry,
  type FileExplorerProps,
  detectLanguage,
  isBinaryFile,
  normalizePath,
  SKIP_DIRS,
  SKIP_FILES,
} from './file-explorer/file-explorer-utils';

// Re-export for backward compatibility
export { detectLanguage } from './file-explorer/file-explorer-utils';
export type { FileEntry, FileExplorerProps } from './file-explorer/file-explorer-utils';

async function loadDirectory(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await readDir(dirPath);
    const result: FileEntry[] = [];

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_FILES.has(entry.name)) continue;

      const fullPath =
        dirPath.endsWith('/') || dirPath.endsWith('\\')
          ? dirPath + entry.name
          : `${dirPath  }/${  entry.name}`;

      result.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory,
        children: undefined,
        expanded: false,
      });
    }

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
  const storeCwd = useAppStore((s) => s.terminalCwd);
  const setTerminalCwd = useAppStore((s) => s.setTerminalCwd);

  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [tree, setTree] = useState<Map<string, FileEntry[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [rootDir, setRootDir] = useState(
    () => rootPath || storeCwd || '',
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    isDir: boolean;
  } | null>(null);

  // Sync rootDir state with props or store changes
  useEffect(() => {
    const targetDir = rootPath || storeCwd || '';
    if (targetDir !== rootDir) {
      setRootDir(targetDir);
    }
    loadRoot(targetDir);
  }, [rootPath, storeCwd]);

  // Sync rootDir state to store Cwd
  useEffect(() => {
    if (rootDir && rootDir !== storeCwd) {
      setTerminalCwd(rootDir);
    }
  }, [rootDir, storeCwd, setTerminalCwd]);

  const loadRoot = async (dir: string) => {
    setLoading(true);
    const entries = await loadDirectory(dir);
    setRootEntries(entries);
    setTree(new Map());
    setLoading(false);
  };

  const toggleFolder = useCallback(
    async (path: string) => {
      const wasLoaded = tree.has(path);

      if (wasLoaded) {
        setTree((prev) => {
          if (!prev.has(path)) return prev;
          const next = new Map(prev);
          next.delete(path);
          return next;
        });
        return;
      }

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
    },
    [tree, loadingPaths],
  );

  const handleFileClick = useCallback(
    async (entry: FileEntry) => {
      if (isBinaryFile(entry.name)) {
        toast.error(t('codeView.binaryNotSupported', { name: entry.name }));
        return;
      }
      try {
        const content = await readTextFile(entry.path);
        const lang = detectLanguage(entry.name);
        onFileOpen(entry.path, entry.name, content, lang);
      } catch (e) {
        console.error('[FileExplorer] Failed to read file:', e);
        toast.error(
          t('codeView.readFailed', { error: e instanceof Error ? e.message : String(e) }),
        );
      }
    },
    [onFileOpen, t],
  );

  const handleSelectFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('fileExplorer.openFolder'),
      });
      if (selected && typeof selected === 'string') {
        setTerminalCwd(selected);
      }
    } catch (e) {
      console.error('[FileExplorer] Failed to select folder:', e);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [t, setTerminalCwd]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  }, []);

  const reloadParent = useCallback(
    async (parentDir: string) => {
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
    },
    [rootDir],
  );

  const handleNewFile = useCallback(
    async (dirPath: string) => {
      const name = prompt(t('fileExplorer.newFilePrompt'));
      if (!name) return;
      const filePath = `${dirPath  }/${  name}`;
      try {
        await writeTextFile(filePath, '');
        await reloadParent(dirPath);
      } catch (e) {
        console.error('[FileExplorer] Failed to create file:', e);
        toast.error(e instanceof Error ? e.message : String(e));
      }
      setContextMenu(null);
    },
    [reloadParent, t],
  );

  const handleNewFolder = useCallback(
    async (dirPath: string) => {
      const name = prompt(t('fileExplorer.newFolderPrompt'));
      if (!name) return;
      const folderPath = `${dirPath  }/${  name}`;
      try {
        await mkdir(folderPath, { recursive: true });
        await reloadParent(dirPath);
      } catch (e) {
        console.error('[FileExplorer] Failed to create folder:', e);
        toast.error(e instanceof Error ? e.message : String(e));
      }
      setContextMenu(null);
    },
    [reloadParent, t],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      const fileName = path.split(/[/\\]/).pop() || '';
      if (!confirm(t('fileExplorer.deleteConfirm', { name: fileName }))) return;
      try {
        await remove(path, { recursive: true });
        const parts = path.split(/[/\\]/);
        parts.pop();
        const sep = path.includes('\\') && !path.includes('/') ? '\\' : '/';
        const parentDir = parts.join(sep) || (sep === '\\' ? 'C:\\' : '/');
        await reloadParent(parentDir);
      } catch (e) {
        console.error('[FileExplorer] Failed to delete:', e);
        toast.error(e instanceof Error ? e.message : String(e));
      }
      setContextMenu(null);
    },
    [reloadParent, t],
  );

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const folderName = rootDir ? rootDir.split(/[/\\]/).pop() || rootDir : '';

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] border-r border-[var(--border-subtle)]">
      <FileExplorerToolbar
        folderName={folderName}
        onOpenFolder={handleSelectFolder}
        onNewFile={() => rootDir && handleNewFile(rootDir)}
        onNewFolder={() => rootDir && handleNewFolder(rootDir)}
        t={t}
      />
      <FileTree
        rootEntries={rootEntries}
        tree={tree}
        loading={loading}
        rootDir={rootDir}
        contextMenu={contextMenu}
        onToggleFolder={toggleFolder}
        onFileClick={handleFileClick}
        onContextMenu={handleContextMenu}
        onOpenFolder={handleSelectFolder}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onDelete={handleDelete}
        t={t}
      />
    </div>
  );
}
