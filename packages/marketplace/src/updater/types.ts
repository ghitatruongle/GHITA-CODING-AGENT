/** Update check result */
export interface UpdateCheckResult {
  /** Plugin ID */
  pluginId: string;
  /** Current installed version */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Whether update is available */
  updateAvailable: boolean;
  /** Whether this is a major version bump */
  isMajor: boolean;
  /** Release notes / changelog */
  changelog?: string;
  /** Release timestamp */
  releasedAt: number;
  /** Download size in bytes */
  size?: number;
}

/** Update status */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'applying'
  | 'completed'
  | 'failed'
  | 'rolled-back';

/** Update job */
export interface UpdateJob {
  /** Job ID */
  id: string;
  /** Plugin ID */
  pluginId: string;
  /** Target version */
  targetVersion: string;
  /** Current status */
  status: UpdateStatus;
  /** Progress 0-100 */
  progress: number;
  /** Error message if failed */
  error?: string;
  /** Job start timestamp */
  startedAt: number;
  /** Job completed timestamp */
  completedAt?: number;
}

/** Diff entry between two versions */
export interface PluginDiffEntry {
  /** Path in plugin */
  path: string;
  /** Change type */
  type: 'added' | 'removed' | 'modified';
  /** Old content (for modified/removed) */
  oldContent?: string;
  /** New content (for added/modified) */
  newContent?: string;
  /** Old size in bytes */
  oldSize?: number;
  /** New size in bytes */
  newSize?: number;
}

/** Full diff between two plugin versions */
export interface PluginDiff {
  /** Plugin ID */
  pluginId: string;
  /** Old version */
  fromVersion: string;
  /** New version */
  toVersion: string;
  /** File-level diffs */
  entries: PluginDiffEntry[];
  /** Total files added */
  added: number;
  /** Total files removed */
  removed: number;
  /** Total files modified */
  modified: number;
  /** Old total size in bytes */
  oldTotalSize: number;
  /** New total size in bytes */
  newTotalSize: number;
}

/** Rollback record */
export interface RollbackRecord {
  /** Record ID */
  id: string;
  /** Plugin ID */
  pluginId: string;
  /** Version being rolled back from */
  fromVersion: string;
  /** Version being restored to */
  toVersion: string;
  /** Rollback reason */
  reason: string;
  /** Rollback timestamp */
  timestamp: number;
  /** Whether rollback succeeded */
  success: boolean;
}

/** Update check options */
export interface UpdateCheckOptions {
  /** Include pre-release versions */
  includePrerelease?: boolean;
  /** Include stable major-version upgrades (e.g. 1.x → 2.0). Off by default. */
  includeMajor?: boolean;
  /** Channel (stable, beta, nightly) */
  channel?: 'stable' | 'beta' | 'nightly';
  /** Request timeout in ms */
  timeout?: number;
  /** Auto-apply compatible updates */
  autoApply?: boolean;
}

/** Snapshot of plugin files (for rollback) */
export interface PluginSnapshot {
  /** Plugin ID */
  pluginId: string;
  /** Version at snapshot time */
  version: string;
  /** File map: path → content */
  files: Map<string, string>;
  /** Snapshot timestamp */
  takenAt: number;
}

/** Update notification */
export interface UpdateNotification {
  /** Plugin ID */
  pluginId: string;
  /** Old version */
  fromVersion: string;
  /** New version */
  toVersion: string;
  /** Notification type */
  type: 'available' | 'downloaded' | 'applied' | 'failed' | 'rolled-back';
  /** Optional message */
  message?: string;
  /** Timestamp */
  timestamp: number;
}

export type UpdateListener = (notification: UpdateNotification) => void;
