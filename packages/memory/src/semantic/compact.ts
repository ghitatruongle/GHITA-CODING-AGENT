/* eslint-disable @typescript-eslint/no-non-null-assertion -- non-null invariants are guaranteed by construction before access */

// Provides intelligent memory management through:
// - Importance scoring (frequency + recency + explicit relevance)
// - Content deduplication via similarity detection
// - Session summarization for long conversations
// - Memory compaction: merge related entries into concise summaries
// - Compaction scheduling for periodic maintenance

import type { SessionMessage } from '../search.js';

// Types

export interface CompactableEntry {
  id: string;
  content: string;
  timestamp: number;
  relevance?: number;
  metadata?: Record<string, unknown>;
  /** Optional embedding vector for similarity comparison */
  vector?: number[];
  /** Session the entry belongs to */
  sessionId?: string;
}

export interface CompactConfig {
  /** Minimum similarity (0-1) to consider entries as duplicates (default: 0.9) */
  dedupThreshold?: number;
  /** Minimum similarity to group entries for merging (default: 0.7) */
  mergeThreshold?: number;
  /** Maximum number of entries in a single compaction group (default: 10) */
  maxGroupSize?: number;
  /** Minimum importance score to keep an entry (default: 0.05) */
  minImportance?: number;
  /** Weight for recency in importance scoring (default: 0.4) */
  recencyWeight?: number;
  /** Weight for frequency in importance scoring (default: 0.3) */
  frequencyWeight?: number;
  /** Weight for explicit relevance in importance scoring (default: 0.3) */
  relevanceWeight?: number;
  /** Half-life in days for time-decay (default: 7) */
  decayHalfLifeDays?: number;
  /** Maximum characters for a session summary (default: 500) */
  maxSummaryLength?: number;
  /** Minimum messages before triggering summarization (default: 20) */
  minMessagesForSummary?: number;
  /** Maximum number of entries retained after compaction (default: 5000) */
  maxEntries?: number;
}

export interface ImportanceScore {
  entryId: string;
  recency: number;
  frequency: number;
  relevance: number;
  composite: number;
}

export interface CompactResult {
  /** Number of entries before compaction */
  before: number;
  /** Number of entries after compaction */
  after: number;
  /** Number of duplicates removed */
  duplicatesRemoved: number;
  /** Number of groups merged */
  groupsMerged: number;
  /** Number of low-importance entries pruned */
  pruned: number;
  /** Entries that survived compaction (may be merged summaries) */
  entries: CompactableEntry[];
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  messageCount: number;
  startTime: number;
  endTime: number;
  keyTopics: string[];
}

export interface CompactSchedule {
  /** Interval in milliseconds between auto-compaction runs (default: 1 hour) */
  intervalMs?: number;
  /** Whether auto-compaction is enabled (default: true) */
  enabled?: boolean;
}

// Memory Compaction Engine

const TOKEN_PATTERN = /[\p{L}\p{N}_-]+/gu;

export class MemoryCompactor {
  private readonly config: Required<CompactConfig>;
  private lastCompactAt = 0;
  private compactionCount = 0;
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: CompactConfig) {
    this.config = {
      dedupThreshold: config?.dedupThreshold ?? 0.9,
      mergeThreshold: config?.mergeThreshold ?? 0.7,
      maxGroupSize: config?.maxGroupSize ?? 10,
      minImportance: config?.minImportance ?? 0.05,
      recencyWeight: config?.recencyWeight ?? 0.4,
      frequencyWeight: config?.frequencyWeight ?? 0.3,
      relevanceWeight: config?.relevanceWeight ?? 0.3,
      decayHalfLifeDays: config?.decayHalfLifeDays ?? 7,
      maxSummaryLength: config?.maxSummaryLength ?? 500,
      minMessagesForSummary: config?.minMessagesForSummary ?? 20,
      maxEntries: config?.maxEntries ?? 5000,
    };
  }

  // Importance Scoring
  
  /** Compute importance score for a single entry */
  scoreImportance(
    entry: CompactableEntry,
    allEntries: CompactableEntry[],
    now?: number,
  ): ImportanceScore {
    const currentTime = now ?? Date.now();

    // Recency: exponential decay with half-life
    const ageMs = Math.max(0, currentTime - entry.timestamp);
    const ageDays = ageMs / 86_400_000;
    const halfLife = this.config.decayHalfLifeDays;
    const recency = Math.pow(0.5, ageDays / halfLife);

    // Frequency: how many other entries share similar tokens (normalized)
    const entryTokens = this.tokenize(entry.content);
    let sharedCount = 0;
    for (const other of allEntries) {
      if (other.id === entry.id) continue;
      const otherTokens = this.tokenize(other.content);
      let shared = 0;
      for (const t of entryTokens) if (otherTokens.has(t)) shared++;
      if (entryTokens.size > 0 && shared / entryTokens.size > 0.3) sharedCount++;
    }
    const frequency = Math.min(1, sharedCount / Math.max(allEntries.length * 0.1, 1));

    // Explicit relevance
    const relevance = entry.relevance ?? 0;

    const composite =
      this.config.recencyWeight * recency +
      this.config.frequencyWeight * frequency +
      this.config.relevanceWeight * relevance;

    return { entryId: entry.id, recency, frequency, relevance, composite };
  }

  /** Score all entries at once. Pre-tokenizes each entry exactly once —
   * the naive per-pair tokenize loop was O(n²) on up to maxEntries items. */
  scoreAll(entries: CompactableEntry[], now?: number): ImportanceScore[] {
    const currentTime = now ?? Date.now();
    const tokenSets = new Map<string, Set<string>>();
    for (const e of entries) {
      tokenSets.set(e.id, this.tokenize(e.content));
    }

    return entries.map((entry) => {
      const ageMs = Math.max(0, currentTime - entry.timestamp);
      const ageDays = ageMs / 86_400_000;
      const recency = Math.pow(0.5, ageDays / this.config.decayHalfLifeDays);

      const entryTokens = tokenSets.get(entry.id)!;
      let sharedCount = 0;
      for (const other of entries) {
        if (other.id === entry.id) continue;
        const otherTokens = tokenSets.get(other.id)!;
        let shared = 0;
        for (const t of entryTokens) if (otherTokens.has(t)) shared++;
        if (entryTokens.size > 0 && shared / entryTokens.size > 0.3) sharedCount++;
      }
      const frequency = Math.min(1, sharedCount / Math.max(entries.length * 0.1, 1));
      const relevance = entry.relevance ?? 0;

      const composite =
        this.config.recencyWeight * recency +
        this.config.frequencyWeight * frequency +
        this.config.relevanceWeight * relevance;

      return { entryId: entry.id, recency, frequency, relevance, composite };
    });
  }

  // Deduplication
  
  /** Detect and remove near-duplicate entries */
  deduplicate(entries: CompactableEntry[]): { kept: CompactableEntry[]; removed: string[] } {
    const threshold = this.config.dedupThreshold;
    const kept: CompactableEntry[] = [];
    const removed: string[] = [];
    const keptTokens: Array<Set<string>> = [];

    for (const entry of entries) {
      const entryTokens = this.tokenize(entry.content);
      let isDup = false;

      for (let i = 0; i < kept.length; i++) {
        const similarity = this.jaccardSimilarity(entryTokens, keptTokens[i]!);
        if (similarity >= threshold) {
          // Keep the more recent one
          if (entry.timestamp > kept[i]!.timestamp) {
            removed.push(kept[i]!.id);
            kept[i] = entry;
            keptTokens[i] = entryTokens;
          } else {
            removed.push(entry.id);
          }
          isDup = true;
          break;
        }
      }

      if (!isDup) {
        kept.push(entry);
        keptTokens.push(entryTokens);
      }
    }

    return { kept, removed };
  }

  // Session Summarization
  
  /** Create a textual summary from a conversation session */
  summarizeSession(
    messages: SessionMessage[],
    sessionId: string,
    options?: { startTime?: number; endTime?: number },
  ): SessionSummary {
    // Extract key topics via frequency analysis
    const allTokens = new Map<string, number>();
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'shall',
      'should',
      'may',
      'might',
      'can',
      'could',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'my',
      'your',
      'we',
      'he',
      'she',
      'they',
      'and',
      'but',
      'or',
      'not',
      'no',
      'if',
      'then',
      'else',
      'so',
      'for',
      'with',
      'from',
      'to',
      'of',
      'in',
      'on',
      'at',
      'by',
      'i',
      'you',
      'me',
      'us',
      'them',
      'what',
      'which',
      'who',
      'how',
      'all',
      'each',
      'every',
      'any',
      'some',
      'very',
      'just',
      'also',
    ]);

    for (const msg of messages) {
      if (msg.role === 'system') continue;
      const tokens = msg.content.toLowerCase().match(TOKEN_PATTERN) ?? [];
      for (const t of tokens) {
        if (t.length > 2 && !stopWords.has(t)) {
          allTokens.set(t, (allTokens.get(t) ?? 0) + 1);
        }
      }
    }

    // Top key topics (max 10)
    const keyTopics = [...allTokens.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    // Build summary text: extract first and last user messages + key topics
    const userMessages = messages.filter((m) => m.role === 'user');
    const summaryParts: string[] = [];

    if (userMessages.length > 0) {
      const first = userMessages[0]!;
      summaryParts.push(`Started with: "${this.truncate(first.content, 100)}"`);
    }
    if (userMessages.length > 1) {
      const last = userMessages[userMessages.length - 1]!;
      summaryParts.push(`Ended with: "${this.truncate(last.content, 100)}"`);
    }
    if (keyTopics.length > 0) {
      summaryParts.push(`Key topics: ${keyTopics.slice(0, 5).join(', ')}`);
    }
    summaryParts.push(`${messages.length} messages exchanged.`);

    let summary = summaryParts.join(' | ');
    if (summary.length > this.config.maxSummaryLength) {
      summary = `${summary.slice(0, this.config.maxSummaryLength)  }...`;
    }

    const startTime =
      options?.startTime ?? (messages.length > 0 ? messages[0]!.timestamp : Date.now());
    const endTime =
      options?.endTime ??
      (messages.length > 0 ? messages[messages.length - 1]!.timestamp : Date.now());

    return { sessionId, summary, messageCount: messages.length, startTime, endTime, keyTopics };
  }

  // Memory Compaction (full pipeline)
  
  /**
   * Run the full compaction pipeline:
   * 1. Score importance
   * 2. Deduplicate
   * 3. Merge similar groups
   * 4. Prune low-importance entries
   * 5. Enforce max entries cap
   */
  compact(entries: CompactableEntry[], now?: number): CompactResult {
    const currentTime = now ?? Date.now();
    const before = entries.length;

    // Step 1: Deduplicate
    const { kept: deduped, removed: dedupRemoved } = this.deduplicate(entries);
    const duplicatesRemoved = dedupRemoved.length;

    // Step 2: Score importance
    const scores = this.scoreAll(deduped, currentTime);
    const scoreMap = new Map(scores.map((s) => [s.entryId, s.composite]));

    // Step 3: Group and merge similar entries
    const groups = this.groupSimilar(deduped);
    let groupsMerged = 0;
    const mergedEntries: CompactableEntry[] = [];
    const mergedIds = new Set<string>();

    for (const group of groups) {
      if (group.length <= 1) {
        if (group.length === 1) mergedEntries.push(group[0]!);
        continue;
      }

      // Merge: keep the highest-scored entry and combine metadata
      groupsMerged++;
      const sorted = group.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
      const best = sorted[0]!;
      const others = sorted.slice(1);

      // Create a merged entry combining content
      const mergedContent = this.buildMergedContent(best, others);
      const maxRelevance = Math.max(...sorted.map((e) => e.relevance ?? 0));

      mergedEntries.push({
        id: best.id,
        content: mergedContent,
        timestamp: best.timestamp,
        relevance: maxRelevance,
        metadata: {
          ...best.metadata,
          mergedFrom: sorted.map((e) => e.id),
          mergedCount: sorted.length,
        },
        vector: best.vector,
        sessionId: best.sessionId,
      });

      for (const other of others) mergedIds.add(other.id);
    }

    // Step 4: Prune low-importance entries
    let pruned = 0;
    const surviving: CompactableEntry[] = [];
    for (const entry of mergedEntries) {
      const score = scoreMap.get(entry.id) ?? 0;
      // Merged entries always survive
      if (entry.metadata?.mergedFrom || score >= this.config.minImportance) {
        surviving.push(entry);
      } else {
        pruned++;
      }
    }

    // Step 5: Enforce max entries cap (keep highest importance)
    surviving.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
    const capped = surviving.slice(0, this.config.maxEntries);
    const cappedPruned = surviving.length - capped.length;

    this.lastCompactAt = currentTime;
    this.compactionCount++;

    return {
      before,
      after: capped.length,
      duplicatesRemoved,
      groupsMerged,
      pruned: pruned + cappedPruned,
      entries: capped,
    };
  }

  // Compaction Scheduling
  
  /** Start automatic periodic compaction */
  startSchedule(
    schedule: CompactSchedule,
    getEntries: () => CompactableEntry[],
    onSave: (entries: CompactableEntry[]) => void,
  ): void {
    this.stopSchedule();
    if (!schedule.enabled) return;

    const intervalMs = schedule.intervalMs ?? 3_600_000;
    this.scheduleTimer = setInterval(() => {
      const entries = getEntries();
      if (entries.length > 0) {
        const result = this.compact(entries);
        onSave(result.entries);
      }
    }, intervalMs);
  }

  /** Stop automatic compaction */
  stopSchedule(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  getLastCompactAt(): number {
    return this.lastCompactAt;
  }
  getCompactionCount(): number {
    return this.compactionCount;
  }

  // Private Helpers
  
  /** Group entries by content similarity */
  private groupSimilar(entries: CompactableEntry[]): CompactableEntry[][] {
    const threshold = this.config.mergeThreshold;
    const maxGroupSize = this.config.maxGroupSize;
    const used = new Set<string>();
    const groups: CompactableEntry[][] = [];

    for (let i = 0; i < entries.length; i++) {
      if (used.has(entries[i]!.id)) continue;

      const group: CompactableEntry[] = [entries[i]!];
      used.add(entries[i]!.id);
      const groupTokens = this.tokenize(entries[i]!.content);

      for (let j = i + 1; j < entries.length && group.length < maxGroupSize; j++) {
        if (used.has(entries[j]!.id)) continue;
        const sim = this.jaccardSimilarity(groupTokens, this.tokenize(entries[j]!.content));
        if (sim >= threshold) {
          group.push(entries[j]!);
          used.add(entries[j]!.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /** Build merged content from a best entry and its peers */
  private buildMergedContent(best: CompactableEntry, others: CompactableEntry[]): string {
    const parts = [best.content];

    // Append unique supplementary info from others
    const bestTokens = this.tokenize(best.content);
    for (const other of others) {
      const otherTokens = this.tokenize(other.content);
      let uniqueTokens = 0;
      for (const t of otherTokens) if (!bestTokens.has(t)) uniqueTokens++;
      if (otherTokens.size > 0 && uniqueTokens / otherTokens.size > 0.3) {
        parts.push(this.truncate(other.content, 150));
      }
    }

    const merged = parts.join(' | ');
    return merged.length > this.config.maxSummaryLength
      ? `${merged.slice(0, this.config.maxSummaryLength)  }...`
      : merged;
  }

  private tokenize(text: string): Set<string> {
    const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
    return new Set(matches.filter((t) => t.length > 1));
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;
    const smaller = a.size <= b.size ? a : b;
    const larger = a.size <= b.size ? b : a;
    for (const t of smaller) if (larger.has(t)) intersection++;

    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)  }...`;
  }
}
