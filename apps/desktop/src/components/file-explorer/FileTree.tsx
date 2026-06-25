// ==============================================================================
// GHITA CODING AGENT — File Tree (renders the file/folder list + context menu)
// ==============================================================================

import { type FileEntry } from './file-explorer-utils';
import { FileTreeNode } from './FileTreeNode';

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

interface FileTreeProps {
  rootEntries: FileEntry[];
  tree: Map<string, FileEntry[]>;
  loading: boolean;
  rootDir: string;
  contextMenu: ContextMenuState | null;
  onToggleFolder: (path: string) => void;
  onFileClick: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  onOpenFolder: () => void;
  onNewFile: (dirPath: string) => void;
  onNewFolder: (dirPath: string) => void;
  onDelete: (path: string) => void;
  t: (key: string) => string;
}

export function FileTree({
  rootEntries,
  tree,
  loading,
  rootDir,
  contextMenu,
  onToggleFolder,
  onFileClick,
  onContextMenu,
  onOpenFolder,
  onNewFile,
  onNewFolder,
  onDelete,
  t,
}: FileTreeProps) {
  const renderEntry = (entry: FileEntry, depth: number = 0): React.ReactNode => {
    const isExpanded = tree.has(entry.path);
    return (
      <FileTreeNode
        key={entry.path}
        entry={entry}
        depth={depth}
        isExpanded={isExpanded}
        onToggleFolder={onToggleFolder}
        onFileClick={onFileClick}
        onContextMenu={onContextMenu}
      >
        {entry.isDirectory &&
          isExpanded &&
          tree.get(entry.path)?.map((child) => renderEntry(child, depth + 1))}
      </FileTreeNode>
    );
  };

  return (
    <>
      {/* File tree */}
      <div className="flex-1 overflow-auto py-1 custom-scrollbar">
        {!rootDir ? (
          <div className="p-5 text-center text-[var(--text-muted)] text-xs flex flex-col gap-2">
            <span className="text-2xl">📂</span>
            <span>{t('fileExplorer.noFolderOpen')}</span>
            <button
              onClick={onOpenFolder}
              className="px-4 py-1.5 bg-[var(--accent-primary)] text-white border-none rounded text-xs cursor-pointer font-semibold"
            >
              {t('fileExplorer.openFolderButton')}
            </button>
          </div>
        ) : loading ? (
          <div className="p-3 text-center text-[var(--text-muted)] text-xs">
            {t('fileExplorer.loading')}
          </div>
        ) : rootEntries.length === 0 ? (
          <div className="p-3 text-center text-[var(--text-muted)] text-xs">
            {t('fileExplorer.emptyFolder')}
          </div>
        ) : (
          rootEntries.map((entry) => renderEntry(entry))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-md py-1 z-[1000] shadow-lg min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.isDir && (
            <>
              <ContextMenuItem
                icon="📄"
                label={t('fileExplorer.newFile')}
                onClick={() => onNewFile(contextMenu.path)}
              />
              <ContextMenuItem
                icon="📁"
                label={t('fileExplorer.newFolder')}
                onClick={() => onNewFolder(contextMenu.path)}
              />
              <div className="h-px bg-[var(--border-subtle)] my-1" />
            </>
          )}
          <ContextMenuItem
            icon="🗑️"
            label={t('fileExplorer.delete')}
            onClick={() => onDelete(contextMenu.path)}
            danger
          />
        </div>
      )}
    </>
  );
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors hover:bg-[var(--bg-hover)] ${
        danger ? 'text-[var(--error)]' : 'text-[var(--text-primary)]'
      }`}
    >
      <span>{icon}</span> {label}
    </div>
  );
}
