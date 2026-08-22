export type ConsolidatedMemoryTier = 'hot' | 'warm' | 'cold' | 'episodic' | 'procedural';

export interface EpisodicEntry {
  id: string;
  sessionId: string;
  summary: string;
  keyFacts: string[];
  timestamp: number;
  sourceMessageCount: number;
}

export interface ProceduralEntry {
  id: string;
  pattern: string;
  description: string;
  steps: string[];
  frequency: number;
  lastObserved: number;
  confidence: number;
}

export interface ConsolidationConfig {
  /** Minimum sessions before consolidation triggers (default: 3). */
  minSessions: number;
  /** Maximum age in ms for entries eligible for consolidation (default: 24h). */
  maxAgeMs: number;
  /** Similarity threshold for merging episodic entries (default: 0.7). */
  mergeThreshold: number;
  /** Minimum frequency for a pattern to become procedural (default: 2). */
  minPatternFrequency: number;
  /** Enable automatic scheduling (default: false). */
  autoSchedule: boolean;
  /** Interval in ms between automatic consolidation runs (default: 3600000 = 1h). */
  intervalMs: number;
  /** Base stability in days for Ebbinghaus decay (default: 7 days). */
  baseStabilityDays?: number;
}

export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  minSessions: 3,
  maxAgeMs: 24 * 60 * 60 * 1000,
  mergeThreshold: 0.7,
  minPatternFrequency: 2,
  autoSchedule: false,
  intervalMs: 3600000,
  baseStabilityDays: 7,
};

/**
 * Calculate Ebbinghaus memory retention score: R = e^(-Δt / S)
 * where Δt is elapsed time in days, S is memory stability (scaled by frequency).
 */
export function calculateEbbinghausRetention(
  lastObserved: number,
  frequency: number,
  baseStabilityDays = 7,
): number {
  const elapsedMs = Math.max(0, Date.now() - lastObserved);
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  const stability = baseStabilityDays * (1 + Math.log2(Math.max(1, frequency)));
  return Math.exp(-elapsedDays / stability);
}

// ---------------------------------------------------------------------------
// DreamLock: prevents concurrent consolidation runs
// ---------------------------------------------------------------------------

export class DreamLock {
  private locked = false;
  private lockHolder: string | null = null;
  private acquiredAt: number | null = null;

  /** Try to acquire the lock. Returns true if acquired, false if already held. */
  tryAcquire(holder: string): boolean {
    if (this.locked) return false;
    this.locked = true;
    this.lockHolder = holder;
    this.acquiredAt = Date.now();
    return true;
  }

  /** Release the lock. Only the holder can release it. */
  release(holder: string): boolean {
    if (!this.locked || this.lockHolder !== holder) return false;
    this.locked = false;
    this.lockHolder = null;
    this.acquiredAt = null;
    return true;
  }

  /** Force-release the lock regardless of holder (for recovery). */
  forceRelease(): void {
    this.locked = false;
    this.lockHolder = null;
    this.acquiredAt = null;
  }

  isLocked(): boolean {
    return this.locked;
  }

  getHolder(): string | null {
    return this.lockHolder;
  }

  getAcquiredAt(): number | null {
    return this.acquiredAt;
  }

  /** Check if the lock has been held longer than timeout (stale lock detection). */
  isStale(timeoutMs: number): boolean {
    if (!this.locked || this.acquiredAt === null) return false;
    return Date.now() - this.acquiredAt > timeoutMs;
  }
}

// ---------------------------------------------------------------------------
// Consolidation Engine
// ---------------------------------------------------------------------------

export interface ConsolidationResult {
  episodicCreated: number;
  episodicMerged: number;
  proceduralCreated: number;
  proceduralUpdated: number;
  entriesProcessed: number;
  durationMs: number;
  skippedDueToLock: boolean;
}

export class ConsolidationEngine {
  private readonly config: ConsolidationConfig;
  private readonly lock: DreamLock;
  private readonly episodicStore = new Map<string, EpisodicEntry>();
  private readonly proceduralStore = new Map<string, ProceduralEntry>();
  private sessionCount = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ConsolidationConfig> = {}) {
    this.config = { ...DEFAULT_CONSOLIDATION_CONFIG, ...config };
    this.lock = new DreamLock();
  }

  /** Register a completed session for consolidation eligibility tracking. */
  registerSession(): void {
    this.sessionCount++;
  }

  getSessionCount(): number {
    return this.sessionCount;
  }

  /** Create an episodic entry from a session summary. */
  addEpisodic(entry: EpisodicEntry): void {
    this.episodicStore.set(entry.id, entry);
  }

  /** Create or update a procedural entry. */
  addProcedural(entry: ProceduralEntry): void {
    const existing = this.proceduralStore.get(entry.id);
    if (existing) {
      entry.frequency = existing.frequency + 1;
      entry.lastObserved = Date.now();
      entry.confidence = Math.min(1, entry.confidence + 0.1);
    }
    this.proceduralStore.set(entry.id, entry);
  }

  /** Query episodic entries by keyword, scored by relevance and Ebbinghaus decay. */
  queryEpisodic(keyword: string): EpisodicEntry[] {
    const lower = keyword.toLowerCase();
    const results: Array<{ entry: EpisodicEntry; score: number }> = [];
    for (const entry of this.episodicStore.values()) {
      const matchesSummary = entry.summary.toLowerCase().includes(lower);
      const matchesFacts = entry.keyFacts.some((f) => f.toLowerCase().includes(lower));
      if (matchesSummary || matchesFacts) {
        const retention = calculateEbbinghausRetention(
          entry.timestamp,
          1,
          this.config.baseStabilityDays,
        );
        const matchStrength = matchesSummary && matchesFacts ? 1.0 : 0.7;
        results.push({ entry, score: matchStrength * retention });
      }
    }
    return results.sort((a, b) => b.score - a.score).map((r) => r.entry);
  }

  /** Query procedural entries by pattern keyword, scored by frequency, confidence and decay. */
  queryProcedural(keyword: string): ProceduralEntry[] {
    const lower = keyword.toLowerCase();
    const results: Array<{ entry: ProceduralEntry; score: number }> = [];
    for (const entry of this.proceduralStore.values()) {
      if (
        entry.pattern.toLowerCase().includes(lower) ||
        entry.description.toLowerCase().includes(lower)
      ) {
        const retention = calculateEbbinghausRetention(
          entry.lastObserved,
          entry.frequency,
          this.config.baseStabilityDays,
        );
        const score = entry.confidence * (1 + Math.log10(entry.frequency)) * retention;
        results.push({ entry, score });
      }
    }
    return results.sort((a, b) => b.score - a.score).map((r) => r.entry);
  }

  listEpisodic(): EpisodicEntry[] {
    return [...this.episodicStore.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  listProcedural(): ProceduralEntry[] {
    return [...this.proceduralStore.values()].sort((a, b) => b.frequency - a.frequency);
  }

  /** Run a consolidation cycle. Returns result or skips if lock is held. */
  async runConsolidation(
    entries: Array<{ id: string; content: string; timestamp: number; sessionId?: string }>,
    holderId = 'consolidation-run',
  ): Promise<ConsolidationResult> {
    const start = Date.now();

    if (!this.lock.tryAcquire(holderId)) {
      return {
        episodicCreated: 0,
        episodicMerged: 0,
        proceduralCreated: 0,
        proceduralUpdated: 0,
        entriesProcessed: 0,
        durationMs: Date.now() - start,
        skippedDueToLock: true,
      };
    }

    try {
      if (this.lock.isStale(5 * 60 * 1000)) {
        this.lock.forceRelease();
        this.lock.tryAcquire(holderId);
      }

      let episodicCreated = 0;
      let episodicMerged = 0;
      let proceduralCreated = 0;
      let proceduralUpdated = 0;

      const bySession = new Map<string, typeof entries>();
      for (const entry of entries) {
        const sid = entry.sessionId ?? 'default';
        const list = bySession.get(sid);
        if (list) {
          list.push(entry);
        } else {
          bySession.set(sid, [entry]);
        }
      }

      for (const [sessionId, sessionEntries] of bySession) {
        if (sessionEntries.length < 2) continue;

        const existingEpisodic = this.findEpisodicBySession(sessionId);
        if (existingEpisodic) {
          const newFacts = sessionEntries
            .map((e) => e.content.slice(0, 100))
            .filter((f) => !existingEpisodic.keyFacts.includes(f));
          if (newFacts.length > 0) {
            existingEpisodic.keyFacts.push(...newFacts.slice(0, 5));
            existingEpisodic.sourceMessageCount += sessionEntries.length;
            episodicMerged++;
          }
        } else {
          const episodic: EpisodicEntry = {
            id: `epi-${sessionId}-${Date.now().toString(36)}`,
            sessionId,
            summary: `Session ${sessionId}: ${sessionEntries.length} interactions`,
            keyFacts: sessionEntries.slice(0, 5).map((e) => e.content.slice(0, 100)),
            timestamp: Date.now(),
            sourceMessageCount: sessionEntries.length,
          };
          this.episodicStore.set(episodic.id, episodic);
          episodicCreated++;
        }
      }

      const patternCounts = new Map<string, number>();
      for (const entry of entries) {
        const pattern = this.extractPattern(entry.content);
        if (pattern) {
          patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
        }
      }

      for (const [pattern, count] of patternCounts) {
        if (count >= this.config.minPatternFrequency) {
          const existingId = this.findProceduralByPattern(pattern);
          if (existingId) {
            const existing = this.proceduralStore.get(existingId);
            if (existing) {
              existing.frequency += count;
              existing.lastObserved = Date.now();
              existing.confidence = Math.min(1, existing.confidence + 0.05 * count);
              proceduralUpdated++;
            }
          } else {
            const proc: ProceduralEntry = {
              id: `proc-${pattern.slice(0, 20).replace(/\s+/g, '-')}-${Date.now().toString(36)}`,
              pattern,
              description: `Observed pattern: ${pattern}`,
              steps: [pattern],
              frequency: count,
              lastObserved: Date.now(),
              confidence: Math.min(1, 0.3 + 0.1 * count),
            };
            this.proceduralStore.set(proc.id, proc);
            proceduralCreated++;
          }
        }
      }

      return {
        episodicCreated,
        episodicMerged,
        proceduralCreated,
        proceduralUpdated,
        entriesProcessed: entries.length,
        durationMs: Date.now() - start,
        skippedDueToLock: false,
      };
    } finally {
      this.lock.release(holderId);
    }
  }

  startAutoSchedule(
    entryProvider: () => Array<{
      id: string;
      content: string;
      timestamp: number;
      sessionId?: string;
    }>,
  ): void {
    if (this.timerHandle) return;
    this.timerHandle = setInterval(async () => {
      if (this.sessionCount >= this.config.minSessions) {
        await this.runConsolidation(entryProvider());
      }
    }, this.config.intervalMs);
  }

  stopAutoSchedule(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  getLock(): DreamLock {
    return this.lock;
  }

  getConfig(): ConsolidationConfig {
    return { ...this.config };
  }

  private findEpisodicBySession(sessionId: string): EpisodicEntry | undefined {
    for (const entry of this.episodicStore.values()) {
      if (entry.sessionId === sessionId) return entry;
    }
    return undefined;
  }

  private findProceduralByPattern(pattern: string): string | undefined {
    for (const [id, entry] of this.proceduralStore) {
      if (entry.pattern === pattern) return id;
    }
    return undefined;
  }

  private extractPattern(content: string): string | null {
    const patterns = [
      /fix\s+(?:bug|issue|error|crash)/i,
      /refactor\s+\w+/i,
      /add\s+(?:test|feature|function|method)/i,
      /debug\s+\w+/i,
      /review\s+(?:code|pr|change)/i,
      /deploy\s+\w+/i,
      /update\s+(?:dependency|package|version)/i,
    ];
    for (const p of patterns) {
      const match = content.match(p);
      if (match) return match[0].toLowerCase();
    }
    return null;
  }
}
