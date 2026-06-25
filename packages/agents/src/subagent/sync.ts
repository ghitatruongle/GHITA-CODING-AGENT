// ==============================================================================
// GHITA CODING AGENT - Parent-Child State Synchronization (Phase 6)
// Snapshot, diff, merge and auto-sync for parent-child agent hierarchies
// ==============================================================================

import type { StateSnapshot, StateDiff, SyncConfig } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep equality check for primitive values (shallow for objects) */
function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

// ---------------------------------------------------------------------------
// StateSyncManager
// ---------------------------------------------------------------------------

export class StateSyncManager {
  /** Per-agent snapshot history */
  private readonly snapshots = new Map<string, StateSnapshot[]>();
  /** Per-agent latest version counter */
  private readonly versionCounter = new Map<string, number>();
  /** Parent→children mapping */
  private readonly children = new Map<string, Set<string>>();
  /** Child→parent mapping */
  private readonly parentOf = new Map<string, string>();
  /** Auto-sync timers */
  private readonly syncTimers = new Map<string, ReturnType<typeof setInterval>>();
  /** Configuration */
  private readonly config: Required<Pick<SyncConfig, 'maxSnapshotsPerAgent'>> & SyncConfig;

  constructor(config: SyncConfig = {}) {
    this.config = {
      maxSnapshotsPerAgent: config.maxSnapshotsPerAgent ?? 20,
      ...config,
    };
  }

  // -----------------------------------------------------------------------
  // Hierarchy Management
  // -----------------------------------------------------------------------

  /**
   * Register a parent-child relationship.
   */
  registerChild(parentId: string, childId: string): void {
    // Set parent reference
    this.parentOf.set(childId, parentId);

    // Add to children set
    const childrenSet = this.children.get(parentId) ?? new Set();
    childrenSet.add(childId);
    this.children.set(parentId, childrenSet);
  }

  /**
   * Remove a child from its parent's hierarchy.
   */
  unregisterChild(childId: string): void {
    const parentId = this.parentOf.get(childId);
    if (parentId) {
      const childrenSet = this.children.get(parentId);
      if (childrenSet) {
        childrenSet.delete(childId);
        if (childrenSet.size === 0) this.children.delete(parentId);
      }
    }
    this.parentOf.delete(childId);
    this.stopAutoSync(childId);
  }

  /**
   * Get all children of a parent agent.
   */
  getChildren(parentId: string): string[] {
    return [...(this.children.get(parentId) ?? [])];
  }

  /**
   * Get the parent of a child agent.
   */
  getParent(childId: string): string | undefined {
    return this.parentOf.get(childId);
  }

  /**
   * Check if an agent has children.
   */
  hasChildren(agentId: string): boolean {
    const set = this.children.get(agentId);
    return set !== undefined && set.size > 0;
  }

  // -----------------------------------------------------------------------
  // Snapshot Management
  // -----------------------------------------------------------------------

  /**
   * Take a snapshot of an agent's current state data.
   */
  snapshot(agentId: string, data: Record<string, unknown>): StateSnapshot {
    const version = (this.versionCounter.get(agentId) ?? 0) + 1;
    this.versionCounter.set(agentId, version);

    const snap: StateSnapshot = {
      agentId,
      timestamp: Date.now(),
      data: { ...data }, // shallow clone to prevent mutation
      version,
    };

    const history = this.snapshots.get(agentId) ?? [];
    history.push(snap);

    // Trim history to max snapshots
    while (history.length > this.config.maxSnapshotsPerAgent) {
      history.shift();
    }

    this.snapshots.set(agentId, history);
    return snap;
  }

  /**
   * Get the latest snapshot for an agent.
   */
  getLatestSnapshot(agentId: string): StateSnapshot | undefined {
    const history = this.snapshots.get(agentId);
    return history?.[history.length - 1];
  }

  /**
   * Get all snapshots for an agent (ordered by version ascending).
   */
  getSnapshots(agentId: string): StateSnapshot[] {
    return [...(this.snapshots.get(agentId) ?? [])];
  }

  /**
   * Get a specific snapshot by version number.
   */
  getSnapshotByVersion(agentId: string, version: number): StateSnapshot | undefined {
    const history = this.snapshots.get(agentId) ?? [];
    return history.find((s) => s.version === version);
  }

  /**
   * Get the current version number for an agent.
   */
  getVersion(agentId: string): number {
    return this.versionCounter.get(agentId) ?? 0;
  }

  // -----------------------------------------------------------------------
  // Diff Computation
  // -----------------------------------------------------------------------

  /**
   * Compute the diff between two snapshots of the same agent.
   */
  diff(agentId: string, fromVersion: number, toVersion: number): StateDiff | null {
    const from = this.getSnapshotByVersion(agentId, fromVersion);
    const to = this.getSnapshotByVersion(agentId, toVersion);
    if (!from || !to) return null;

    return this.computeDiff(from, to);
  }

  /**
   * Compute the diff between the latest snapshot and a given version.
   */
  diffFromLatest(agentId: string, fromVersion: number): StateDiff | null {
    const to = this.getLatestSnapshot(agentId);
    const from = this.getSnapshotByVersion(agentId, fromVersion);
    if (!from || !to) return null;

    return this.computeDiff(from, to);
  }

  /**
   * Compute diff between two arbitrary state data objects.
   */
  diffData(
    agentId: string,
    fromData: Record<string, unknown>,
    toData: Record<string, unknown>,
    fromVersion = 0,
    toVersion = 1,
  ): StateDiff {
    const added: Record<string, unknown> = {};
    const removed: string[] = [];
    const changed: Record<string, unknown> = {};

    // Find added and changed keys
    for (const [key, value] of Object.entries(toData)) {
      if (!(key in fromData)) {
        added[key] = value;
      } else if (!isPrimitive(value) || !isPrimitive(fromData[key]) || value !== fromData[key]) {
        changed[key] = value;
      }
    }

    // Find removed keys
    for (const key of Object.keys(fromData)) {
      if (!(key in toData)) {
        removed.push(key);
      }
    }

    return {
      agentId,
      fromVersion,
      toVersion,
      added,
      removed,
      changed,
    };
  }

  // -----------------------------------------------------------------------
  // Sync Operations
  // -----------------------------------------------------------------------

  /**
   * Sync a child's state to its parent.
   * Takes a snapshot of the child, computes the diff from previous,
   * and notifies via the onSync callback.
   *
   * RESILIENCE (audit fix 2.5): the previous implementation returned
   * `null` when `previousVersion === 0`, silently dropping the very
   * first sync after registration. Parents therefore never received
   * the initial state of their children. We now treat version 0 as
   * "no previous snapshot exists" and emit a full add diff instead.
   */
  syncToParent(childId: string, data: Record<string, unknown>): StateDiff | null {
    const previousVersion = this.getVersion(childId);
    const snap = this.snapshot(childId, data);
    const parentId = this.parentOf.get(childId);

    if (!parentId) return null;

    let diffResult: StateDiff;
    if (previousVersion === 0) {
      // First-time sync — emit all current keys as additions so the
      // parent mirrors the initial state. Copy into a fresh
      // `Record<string, unknown>` so external mutations of `snap.data`
      // do not retroactively mutate the diff payload.
      //
      // RESILIENCE (audit fix 2.5): `StateDiff.removed` is a `string[]`
      // (keys present in `from` but missing in `to`). There is no
      // previous snapshot, so `removed` is an empty array. `added`
      // and `changed` are `Record<string, unknown>` because they carry
      // payload values, not just key names.
      const initialState: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(snap.data)) {
        initialState[k] = v;
      }
      diffResult = {
        agentId: childId,
        fromVersion: 0,
        toVersion: snap.version,
        added: initialState,
        removed: [],
        changed: {},
      };
    } else {
      const previousSnap = this.getSnapshotByVersion(childId, previousVersion);
      if (!previousSnap) return null;
      diffResult = this.computeDiff(previousSnap, snap);
    }

    this.config.onSync?.(childId, diffResult);

    return diffResult;
  }

  /**
   * Sync all children's states to a parent.
   * Returns a map of childId → StateDiff.
   */
  syncAllChildren(
    parentId: string,
    childStates: Map<string, Record<string, unknown>>,
  ): Map<string, StateDiff> {
    const results = new Map<string, StateDiff>();
    const childrenIds = this.getChildren(parentId);

    for (const childId of childrenIds) {
      const data = childStates.get(childId);
      if (!data) continue;

      const diffResult = this.syncToParent(childId, data);
      if (diffResult) {
        results.set(childId, diffResult);
      }
    }

    return results;
  }

  /**
   * Pull the latest state from a parent into a child.
   * Returns the parent's latest snapshot data or null.
   */
  pullFromParent(childId: string): Record<string, unknown> | null {
    const parentId = this.parentOf.get(childId);
    if (!parentId) return null;

    const parentSnap = this.getLatestSnapshot(parentId);
    return parentSnap?.data ?? null;
  }

  /**
   * Merge multiple child states into a single aggregate for the parent.
   * Useful for fan-in patterns where parent collects results from children.
   */
  mergeChildrenStates(parentId: string): Record<string, unknown> {
    const childrenIds = this.getChildren(parentId);
    const merged: Record<string, unknown> = {
      _childrenCount: childrenIds.length,
      _childrenIds: childrenIds,
    };

    for (const childId of childrenIds) {
      const snap = this.getLatestSnapshot(childId);
      if (snap) {
        merged[childId] = snap.data;
      }
    }

    return merged;
  }

  // -----------------------------------------------------------------------
  // Auto-Sync
  // -----------------------------------------------------------------------

  /**
   * Start automatic periodic sync for a child agent.
   * The syncFn is called at the configured interval to produce state data.
   */
  startAutoSync(childId: string, syncFn: () => Record<string, unknown>, intervalMs?: number): void {
    const interval = intervalMs ?? this.config.autoSyncIntervalMs ?? 5_000;
    this.stopAutoSync(childId); // Ensure no duplicate timers

    const timer = setInterval(() => {
      const data = syncFn();
      this.syncToParent(childId, data);
    }, interval);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }

    this.syncTimers.set(childId, timer);
  }

  /**
   * Stop automatic sync for a child agent.
   */
  stopAutoSync(childId: string): void {
    const timer = this.syncTimers.get(childId);
    if (timer) {
      clearInterval(timer);
      this.syncTimers.delete(childId);
    }
  }

  /**
   * Stop all auto-sync timers.
   */
  stopAllAutoSync(): void {
    for (const [childId] of this.syncTimers) {
      this.stopAutoSync(childId);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /**
   * Remove all state data for an agent.
   */
  clearAgent(agentId: string): void {
    this.snapshots.delete(agentId);
    this.versionCounter.delete(agentId);
    this.stopAutoSync(agentId);
    this.unregisterChild(agentId);

    // Also remove as parent
    const childrenSet = this.children.get(agentId);
    if (childrenSet) {
      for (const childId of childrenSet) {
        this.parentOf.delete(childId);
      }
      this.children.delete(agentId);
    }
  }

  /**
   * Destroy the sync manager, clearing all data and timers.
   */
  destroy(): void {
    this.stopAllAutoSync();
    this.snapshots.clear();
    this.versionCounter.clear();
    this.children.clear();
    this.parentOf.clear();
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  private computeDiff(from: StateSnapshot, to: StateSnapshot): StateDiff {
    return this.diffData(to.agentId, from.data, to.data, from.version, to.version);
  }
}
