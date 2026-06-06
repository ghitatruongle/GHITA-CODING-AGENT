// ==============================================================================
// GHITA CODING AGENT - File Explorer Dirty Badge (Phase 17)
// Renders dirty/saving/loading/error indicators overlay cho file tree rows.
// Designed to integrate với FileExplorer.tsx mà KHÔNG modify existing component.
// Consumers nhận dirty map (path → state) và truyền vào component này.
// ==============================================================================

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { FileEntryState, FileOperationLogEntry } from '@ghita/shared/ide-types';

export interface FileExplorerDirtyBadgeProps {
  /** Trạng thái hiện tại của file */
  state?: FileEntryState;
  /** Compact mode (chỉ hiển thị dot, không có label) */
  compact?: boolean;
  /** Tooltip text override */
  tooltip?: string;
}

const STATE_LABEL: Record<FileEntryState, string> = {
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Error',
  loading: 'Loading…',
};

const STATE_COLOR: Record<FileEntryState, string> = {
  clean: 'var(--text-secondary, #888)',
  dirty: 'var(--accent, #3b82f6)',
  saving: 'var(--warning, #f59e0b)',
  error: 'var(--error, #ef4444)',
  loading: 'var(--text-secondary, #888)',
};

const STATE_GLYPH: Record<FileEntryState, string> = {
  clean: '',
  dirty: '●',
  saving: '⟳',
  error: '!',
  loading: '◌',
};

export function FileExplorerDirtyBadge({
  state = 'clean',
  compact = true,
  tooltip,
}: FileExplorerDirtyBadgeProps) {
  if (state === 'clean') return null;
  const label = STATE_LABEL[state];
  const color = STATE_COLOR[state];
  const glyph = STATE_GLYPH[state];

  if (compact) {
    return (
      <span
        className={`file-dirty-badge compact state-${state}`}
        title={tooltip ?? label}
        aria-label={label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          fontSize: 10,
          fontWeight: 700,
          color,
          flexShrink: 0,
        }}
      >
        {glyph}
      </span>
    );
  }

  return (
    <span
      className={`file-dirty-badge state-${state}`}
      title={tooltip ?? label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 500,
        background:
          state === 'dirty' ? 'var(--accent-bg, rgba(59, 130, 246, 0.15))' : 'transparent',
        color,
        flexShrink: 0,
      }}
    >
      {glyph && <span style={{ fontWeight: 700 }}>{glyph}</span>}
      {label}
    </span>
  );
}

// ----------------------------------------------------------------------------
// DirtyMapProvider - context cho multiple consumers
// ----------------------------------------------------------------------------

export interface DirtyMapContextValue {
  /** path → state */
  getState: (path: string) => FileEntryState;
  /** Set state (delegate tới CodeView hoặc zustand store) */
  setState: (path: string, state: FileEntryState) => void;
  /** Get tất cả dirty paths */
  getDirtyPaths: () => string[];
  /** Get operation log */
  getOperationLog: () => FileOperationLogEntry[];
}

const DEFAULT_CONTEXT: DirtyMapContextValue = {
  getState: () => 'clean',
  setState: () => {},
  getDirtyPaths: () => [],
  getOperationLog: () => [],
};

export const DirtyMapContext = createContext<DirtyMapContextValue>(DEFAULT_CONTEXT);

export function useDirtyMap(): DirtyMapContextValue {
  return useContext(DirtyMapContext);
}

// ----------------------------------------------------------------------------
// Hook: tạo dirty map manager (local state, cho single-file usage)
// ----------------------------------------------------------------------------

export interface UseDirtyMapReturn extends DirtyMapContextValue {
  map: Map<string, FileEntryState>;
  totalCount: number;
  dirtyCount: number;
  savingCount: number;
  errorCount: number;
  isDirty: (path: string) => boolean;
  clear: () => void;
}

export function useLocalDirtyMap(): UseDirtyMapReturn {
  const [map, setMap] = useState<Map<string, FileEntryState>>(() => new Map());

  const setState = useCallback((path: string, state: FileEntryState) => {
    setMap((prev) => {
      const next = new Map(prev);
      if (state === 'clean') next.delete(path);
      else next.set(path, state);
      return next;
    });
  }, []);

  const getState = useCallback((path: string) => map.get(path) ?? 'clean', [map]);

  const isDirty = useCallback((path: string) => map.get(path) === 'dirty', [map]);

  const getDirtyPaths = useCallback(() => {
    return Array.from(map.entries())
      .filter(([, s]) => s === 'dirty')
      .map(([p]) => p);
  }, [map]);

  const getOperationLog = useCallback(() => [] as FileOperationLogEntry[], []);

  const clear = useCallback(() => setMap(new Map()), []);

  const totalCount = map.size;
  const dirtyCount = useMemo(() => getDirtyPaths().length, [getDirtyPaths]);
  const savingCount = useMemo(
    () => Array.from(map.values()).filter((s) => s === 'saving').length,
    [map],
  );
  const errorCount = useMemo(
    () => Array.from(map.values()).filter((s) => s === 'error').length,
    [map],
  );

  return {
    map,
    totalCount,
    dirtyCount,
    savingCount,
    errorCount,
    isDirty,
    clear,
    setState,
    getState,
    getDirtyPaths,
    getOperationLog,
  };
}
