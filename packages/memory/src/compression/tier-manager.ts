// ==============================================================================
// GHITA CODING AGENT - Tier Manager (Phase 30)
// Migrate entries between hot/warm/cold tiers based on age, access, and
// capacity limits.
// ==============================================================================

import type {
  CompressableMemoryEntry,
  MemoryStorageAdapter,
  MemoryTier,
  TierMigrationConfig,
  TierMigrationResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Tier Manager
// ---------------------------------------------------------------------------

export class TierManager {
  private config: Required<TierMigrationConfig>;

  constructor(config?: Partial<TierMigrationConfig>) {
    this.config = {
      hotMaxSize: config?.hotMaxSize ?? 1000,
      warmMaxSize: config?.warmMaxSize ?? 10_000,
      coldAgeMs: config?.coldAgeMs ?? 30 * 24 * 60 * 60 * 1000,
      hotMinAccess: config?.hotMinAccess ?? 2,
      warmMinAccess: config?.warmMinAccess ?? 1,
    };
  }

  /**
   * Run tier migration: demote cold/old entries, promote hot/frequent ones,
   * and prune entries that have lost importance.
   */
  async migrate(
    storage: MemoryStorageAdapter,
    now: number = Date.now(),
  ): Promise<TierMigrationResult> {
    const all = await storage.list();

    const hot = all.filter((e) => e.tier === 'hot');
    const warm = all.filter((e) => e.tier === 'warm');
    const cold = all.filter((e) => e.tier === 'cold');

    const promoted: CompressableMemoryEntry[] = [];
    const demoted: CompressableMemoryEntry[] = [];
    const pruned: CompressableMemoryEntry[] = [];

    // === Demote hot → warm if over capacity ===
    if (hot.length > this.config.hotMaxSize) {
      const sorted = [...hot].sort((a, b) => this.tierScore(a, now) - this.tierScore(b, now));
      const toDemoteCount = hot.length - this.config.hotMaxSize;
      for (let i = 0; i < toDemoteCount; i++) {
        const entry = sorted[i];
        if (!entry) continue;
        entry.tier = 'warm';
        demoted.push(entry);
      }
    }

    // === Demote hot → warm if not accessed enough AND old ===
    for (const entry of hot) {
      if (
        entry.tier === 'hot' &&
        entry.accessCount < this.config.hotMinAccess &&
        now - entry.lastAccessedAt > this.config.coldAgeMs / 4
      ) {
        entry.tier = 'warm';
        demoted.push(entry);
      }
    }

    // === Demote warm → cold if over capacity ===
    // MEMORY (audit fix 2.19): the previous expression was
    //   `warm.length - demoted.filter(...).length`
    // which subtracted demoted entries from the *current* warm count.
    // But demoted entries had just been re-tagged `tier = 'warm'` above,
    // so they are now part of the warm set. The correct computation adds
    // them: `warm.length + demoted(filter).length`. Otherwise the eviction
    // trigger fires too late (or not at all) and the warm tier grows
    // unboundedly until the next migration pass.
    const currentWarmCount =
      warm.length + demoted.filter((e) => e.tier === 'warm').length;
    if (currentWarmCount > this.config.warmMaxSize) {
      const sorted = [...warm].sort((a, b) => this.tierScore(a, now) - this.tierScore(b, now));
      const toDemoteCount = currentWarmCount - this.config.warmMaxSize;
      for (let i = 0; i < toDemoteCount; i++) {
        const entry = sorted[i];
        if (!entry) continue;
        entry.tier = 'cold';
        demoted.push(entry);
      }
    }

    // === Demote warm → cold if very old ===
    for (const entry of warm) {
      if (entry.tier === 'warm' && now - entry.lastAccessedAt > this.config.coldAgeMs) {
        entry.tier = 'cold';
        demoted.push(entry);
      }
    }

    // === Promote cold → warm if access count spikes ===
    for (const entry of cold) {
      if (entry.accessCount >= this.config.warmMinAccess) {
        entry.tier = 'warm';
        promoted.push(entry);
      }
    }

    // === Promote warm → hot if hot tier has room AND entry is recent/frequent ===
    const updatedHotCount =
      hot.length - demoted.filter((e) => e.id && hot.find((h) => h.id === e.id)).length;
    if (updatedHotCount < this.config.hotMaxSize) {
      const warmSorted = [...warm].sort((a, b) => this.tierScore(b, now) - this.tierScore(a, now));
      for (const entry of warmSorted) {
        if (updatedHotCount + promoted.length >= this.config.hotMaxSize) break;
        if (entry.accessCount >= this.config.hotMinAccess) {
          entry.tier = 'hot';
          promoted.push(entry);
        }
      }
    }

    // === Prune: cold entries with very low importance AND low access ===
    for (const entry of cold) {
      if (
        entry.importance < 0.05 &&
        entry.accessCount === 0 &&
        now - entry.timestamp > this.config.coldAgeMs
      ) {
        pruned.push(entry);
      }
    }

    // === Persist changes ===
    const changed = [...promoted, ...demoted];
    if (changed.length > 0) await storage.upsert(changed);
    if (pruned.length > 0) await storage.delete(pruned.map((e) => e.id));

    // Final counts
    const newCounts = await storage.countByTier();

    return {
      promoted,
      demoted,
      pruned,
      counts: newCounts,
    };
  }

  /** Compute a tier score (higher = more important, keep in hot). */
  tierScore(entry: CompressableMemoryEntry, now: number): number {
    const ageMs = Math.max(0, now - entry.timestamp);
    const recencyScore = Math.max(0, 1 - ageMs / this.config.coldAgeMs);
    const accessScore = Math.min(1, entry.accessCount / 10);
    const importanceScore = entry.importance;
    return 0.4 * recencyScore + 0.3 * accessScore + 0.3 * importanceScore;
  }

  /** Classify which tier a new entry should start in. */
  classifyInitialTier(entry: CompressableMemoryEntry, _now: number = Date.now()): MemoryTier {
    void _now;
    // Summaries and old entries go to warm; fresh, important entries go to hot
    if (entry.isSummary) return 'warm';
    if (entry.importance >= 0.7) return 'hot';
    if (entry.importance >= 0.3) return 'warm';
    return 'cold';
  }
}
