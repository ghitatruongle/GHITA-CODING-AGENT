// ==============================================================================
// GHITA CODING AGENT - Editor Tab Bar (Phase 17)
// Reusable tab strip cho file editor. Designed to integrate với CodeView.tsx
// (which manages tab state) without modifying existing component.
// - Drag-to-reorder (optional, off by default)
// - Close button per tab
// - Dirty dot indicator
// - Middle-click / Ctrl+W to close
// - Active highlight + unsaved changes confirmation
// - Reorder via drag (if onReorder callback provided)
// ==============================================================================

import { useCallback, useMemo, useRef } from 'react';
import type { EditorTab } from '@ghita/shared/ide-types';

export interface EditorTabBarProps {
  /** Tất cả tabs đang mở (theo thứ tự) */
  tabs: EditorTab[];
  /** Đường dẫn tab đang active */
  activePath: string;
  /** Click vào tab */
  onTabClick: (path: string) => void;
  /** Đóng tab (với confirm nếu dirty) */
  onTabClose: (path: string) => void;
  /** Optional: reorder tabs (drag & drop) */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Optional: close tất cả */
  onCloseAll?: () => void;
  /** Optional: close tất cả trừ active */
  onCloseOthers?: () => void;
  /** Optional: confirm before close dirty tab */
  confirmDirtyClose?: (tab: EditorTab) => boolean;
  /** Optional: render custom tab content (vd: icon) */
  renderTabIcon?: (tab: EditorTab) => React.ReactNode;
  /** Optional: tab width (px) */
  tabWidth?: number;
  /** Optional: max width trước khi truncate */
  maxTabWidth?: number;
  /** Show close button on tab */
  showCloseButton?: boolean;
  /** Wrap tabs khi overflow */
  wrapTabs?: boolean;
}

const DEFAULT_TAB_WIDTH = 140;
const DEFAULT_MAX_TAB_WIDTH = 200;

export function EditorTabBar({
  tabs,
  activePath,
  onTabClick,
  onTabClose,
  onReorder,
  onCloseAll,
  onCloseOthers,
  confirmDirtyClose,
  renderTabIcon,
  tabWidth = DEFAULT_TAB_WIDTH,
  maxTabWidth = DEFAULT_MAX_TAB_WIDTH,
  showCloseButton = true,
  wrapTabs = true,
}: EditorTabBarProps) {
  const dragSourceIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  const handleClose = useCallback(
    (tab: EditorTab, e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      if (tab.path === 'savedContent' && tab.content === tab.savedContent) {
        // not dirty
        onTabClose(tab.path);
        return;
      }
      const isDirty = tab.content !== tab.savedContent;
      if (isDirty && confirmDirtyClose) {
        const allowed = confirmDirtyClose(tab);
        if (!allowed) return;
      }
      onTabClose(tab.path);
    },
    [onTabClose, confirmDirtyClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, tab: EditorTab) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTabClick(tab.path);
        return;
      }
      if (e.key === 'Delete' || (e.ctrlKey && e.key === 'w') || (e.metaKey && e.key === 'w')) {
        e.preventDefault();
        handleClose(tab, e);
      }
    },
    [handleClose, onTabClick],
  );

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, tab: EditorTab) => {
      if (e.button === 1) {
        e.preventDefault();
        handleClose(tab, e);
      }
    },
    [handleClose],
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragSourceIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIndex.current = index;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      const from = dragSourceIndex.current;
      const to = index;
      if (from !== null && to !== from && onReorder) {
        onReorder(from, to);
      }
      dragSourceIndex.current = null;
      dragOverIndex.current = null;
    },
    [onReorder],
  );

  const handleDragEnd = useCallback(() => {
    dragSourceIndex.current = null;
    dragOverIndex.current = null;
  }, []);

  const containerStyle = useMemo<React.CSSProperties>(() => {
    return {
      display: 'flex',
      flexDirection: wrapTabs ? 'row' : 'row',
      flexWrap: wrapTabs ? 'wrap' : 'nowrap',
      overflowX: wrapTabs ? 'visible' : 'auto',
      overflowY: 'hidden',
      gap: 2,
      alignItems: 'stretch',
      padding: '0 4px',
      borderBottom: '1px solid var(--border, #2a2a2a)',
      minHeight: 36,
      background: 'var(--bg-elevated, #1a1a1a)',
    };
  }, [wrapTabs]);

  if (tabs.length === 0) {
    return (
      <div className="editor-tab-bar empty" style={containerStyle}>
        {/* No tabs open */}
      </div>
    );
  }

  return (
    <div
      className="editor-tab-bar"
      style={containerStyle}
      role="tablist"
      aria-label="Open editor tabs"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.path === activePath;
        const isDirty = tab.content !== tab.savedContent;
        const width = Math.min(maxTabWidth, Math.max(tabWidth, 80));
        return (
          <div
            key={tab.path}
            className={`editor-tab ${isActive ? 'active' : ''} ${isDirty ? 'dirty' : ''}`}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            draggable={Boolean(onReorder)}
            onClick={() => onTabClick(tab.path)}
            onKeyDown={(e) => handleKeyDown(e, tab)}
            onMouseDown={(e) => handleMiddleClick(e, tab)}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            title={tab.displayPath ?? tab.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 8px',
              minWidth: 80,
              maxWidth: width,
              height: 36,
              cursor: 'pointer',
              background: isActive ? 'var(--bg-active, #2a2a2a)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent, #3b82f6)' : '2px solid transparent',
              color: 'var(--text-primary, #e5e5e5)',
              fontSize: 13,
              userSelect: 'none',
              position: 'relative',
            }}
          >
            {renderTabIcon?.(tab)}
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontStyle: isDirty ? 'italic' : 'normal',
              }}
            >
              {tab.name}
            </span>
            {isDirty && (
              <span
                className="dirty-dot"
                aria-label="Unsaved changes"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent, #3b82f6)',
                  flexShrink: 0,
                }}
              />
            )}
            {showCloseButton && (
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tab.name}`}
                onClick={(e) => handleClose(tab, e)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary, #888)',
                  cursor: 'pointer',
                  padding: 0,
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                  fontSize: 14,
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover, #333)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {(onCloseAll || onCloseOthers) && (
        <div
          className="tab-bar-overflow"
          style={{ marginLeft: 'auto', display: 'flex', gap: 4, padding: '0 4px' }}
        >
          {onCloseOthers && (
            <button
              type="button"
              onClick={onCloseOthers}
              style={overflowBtnStyle}
              title="Close other tabs"
            >
              …
            </button>
          )}
          {onCloseAll && (
            <button
              type="button"
              onClick={onCloseAll}
              style={overflowBtnStyle}
              title="Close all tabs"
            >
              ××
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const overflowBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary, #888)',
  cursor: 'pointer',
  padding: '0 6px',
  fontSize: 12,
  height: 28,
  borderRadius: 3,
};

// ----------------------------------------------------------------------------
// Selector helpers
// ----------------------------------------------------------------------------

/** Selector: tab đang active */
export function selectActiveTab(tabs: EditorTab[], activePath: string): EditorTab | undefined {
  return tabs.find((t) => t.path === activePath);
}

/** Selector: list các tab dirty */
export function selectDirtyTabs(tabs: EditorTab[]): EditorTab[] {
  return tabs.filter((t) => t.content !== t.savedContent);
}

/** Selector: count dirty */
export function selectDirtyCount(tabs: EditorTab[]): number {
  return selectDirtyTabs(tabs).length;
}
