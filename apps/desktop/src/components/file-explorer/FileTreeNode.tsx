// ==============================================================================
// GHITA CODING AGENT — File Tree Node (single entry in the explorer tree)
// ==============================================================================

import { type FileEntry, fileIcon } from './file-explorer-utils';

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  isExpanded: boolean;
  onToggleFolder: (path: string) => void;
  onFileClick: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  children?: React.ReactNode;
}

export function FileTreeNode({
  entry,
  depth,
  isExpanded,
  onToggleFolder,
  onFileClick,
  onContextMenu,
  children,
}: FileTreeNodeProps) {
  return (
    <div>
      <div
        className="focus-ring flex items-center gap-1 cursor-pointer text-[var(--text-primary)] text-xs whitespace-nowrap overflow-hidden hover:bg-[var(--bg-hover)] transition-colors"
        style={{ padding: `3px 8px 3px ${12 + depth * 16}px` }}
        role="button"
        tabIndex={0}
        aria-label={entry.name}
        aria-expanded={entry.isDirectory ? isExpanded : undefined}
        onClick={() => (entry.isDirectory ? onToggleFolder(entry.path) : onFileClick(entry))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (entry.isDirectory) onToggleFolder(entry.path);
            else onFileClick(entry);
          }
        }}
        onContextMenu={(e) => onContextMenu(e, entry.path, entry.isDirectory)}
      >
        {entry.isDirectory ? (
          <span
            className="text-[10px] w-3.5 text-center text-[var(--text-muted)] transition-transform duration-150"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
          >
            ▶
          </span>
        ) : (
          <span className="w-3.5" />
        )}
        <span className="text-sm shrink-0">
          {entry.isDirectory ? (isExpanded ? '📂' : '📁') : fileIcon(entry.name)}
        </span>
        <span
          className="overflow-hidden text-ellipsis"
          style={{ fontWeight: entry.isDirectory ? 500 : 400 }}
        >
          {entry.name}
        </span>
      </div>
      {children}
    </div>
  );
}
