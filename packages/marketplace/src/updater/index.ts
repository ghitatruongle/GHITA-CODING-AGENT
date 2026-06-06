// ==============================================================================
// GHITA CODING AGENT - Auto-updater Module Barrel Export (Phase 32)
// ==============================================================================

// --- Types ---
export type {
  UpdateCheckResult,
  UpdateStatus,
  UpdateJob,
  PluginDiffEntry,
  PluginDiff,
  RollbackRecord,
  UpdateCheckOptions,
  PluginSnapshot,
  UpdateNotification,
  UpdateListener,
} from './types.js';

// --- Core Updater ---
export { PluginUpdater } from './updater.js';

// --- Diff Calculator ---
export { PluginDiffer } from './differ.js';

// --- Rollback Manager ---
export { RollbackManager } from './rollback.js';
