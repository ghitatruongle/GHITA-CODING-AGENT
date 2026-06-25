// ==============================================================================
// GHITA CODING AGENT — File Explorer Toolbar (header bar)
// ==============================================================================

interface FileExplorerToolbarProps {
  folderName: string;
  onOpenFolder: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  t: (key: string) => string;
}

function ToolbarButton({
  icon,
  title,
  onClick,
}: {
  icon: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="bg-none border-none cursor-pointer text-sm p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
    >
      {icon}
    </button>
  );
}

export function FileExplorerToolbar({
  folderName,
  onOpenFolder,
  onNewFile,
  onNewFolder,
  t,
}: FileExplorerToolbarProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          {t('fileExplorer.explorer')}
        </span>
        <div className="flex gap-1">
          <ToolbarButton icon="📁" title={t('fileExplorer.openFolder')} onClick={onOpenFolder} />
          <ToolbarButton icon="📄" title={t('fileExplorer.newFile')} onClick={onNewFile} />
          <ToolbarButton icon="➕" title={t('fileExplorer.newFolder')} onClick={onNewFolder} />
        </div>
      </div>

      {/* Folder name */}
      {folderName && (
        <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] border-b border-[var(--border-subtle)] overflow-hidden text-ellipsis whitespace-nowrap bg-[var(--bg-secondary)]">
          {folderName}
        </div>
      )}
    </>
  );
}
