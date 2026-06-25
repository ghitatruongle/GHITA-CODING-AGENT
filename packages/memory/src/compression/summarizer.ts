// ==============================================================================
// GHITA CODING AGENT - Memory Summarizer (Phase 30)
// Groups similar low-importance entries and produces compact summaries.
// ==============================================================================

import type {
  CompressableMemoryEntry,
  EmbeddingProvider,
  SummarizationResult,
  SummarizerConfig,
  SummaryGroup,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal: topic extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
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
  'i',
  'you',
  'he',
  'she',
  'they',
  'we',
  'me',
  'us',
  'them',
  'my',
  'your',
  'and',
  'or',
  'but',
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
  'as',
  'into',
  'about',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'where',
  'when',
  'why',
  'how',
  'all',
  'each',
  'every',
  'any',
  'some',
  'few',
  'many',
  'most',
  'other',
  'such',
  'only',
  'same',
  'than',
  'too',
  'very',
  'just',
  'also',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter(
    (t) => t.length > 2 && !STOP_WORDS.has(t),
  );
}

function extractKeyTopics(text: string, max = 5): string[] {
  const counts = new Map<string, number>();
  for (const tok of tokenize(text)) {
    counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => t);
}

// ---------------------------------------------------------------------------
// Grouping: cluster entries that are temporally close and topically similar
// ---------------------------------------------------------------------------

function groupByProximity(
  entries: CompressableMemoryEntry[],
  minGroupSize: number,
): CompressableMemoryEntry[][] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0];
  if (!first) return [];
  const groups: CompressableMemoryEntry[][] = [];
  let current: CompressableMemoryEntry[] = [first];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as CompressableMemoryEntry;
    const curr = sorted[i] as CompressableMemoryEntry;
    const gapMs = curr.timestamp - prev.timestamp;

    // If within 1 hour AND share at least one tag or session, keep in same group
    const sameTag = (curr.tags ?? []).some((t) => (prev.tags ?? []).includes(t));
    const sameSession = curr.sessionId && prev.sessionId && curr.sessionId === prev.sessionId;

    if (gapMs < 60 * 60 * 1000 && (sameTag || sameSession)) {
      current.push(curr);
    } else {
      if (current.length >= minGroupSize) groups.push(current);
      current = [curr];
    }
  }
  if (current.length >= minGroupSize) groups.push(current);

  return groups;
}

// ---------------------------------------------------------------------------
// Build a summary from a group of entries
// ---------------------------------------------------------------------------

function buildSummary(group: CompressableMemoryEntry[], maxLength: number): SummaryGroup {
  const firstItem = group[0];
  const lastItem = group[group.length - 1];
  if (!firstItem || !lastItem) throw new Error('Empty group');

  const startTime = firstItem.timestamp;
  const endTime = lastItem.timestamp;
  const combinedText = group.map((e) => e.content).join(' ');

  // Extract up to 10 key topics
  const keyTopics = extractKeyTopics(combinedText, 10);

  // Get the first and last entry content (truncated)
  const firstSnippet = truncate(firstItem.content, 80);
  const lastSnippet = truncate(lastItem.content, 80);

  // Build summary text
  const summaryParts: string[] = [];

  if (group.length === 1) {
    summaryParts.push(truncate(firstItem.content, maxLength));
  } else {
    summaryParts.push(
      `${group.length} entries from ${new Date(startTime).toISOString().slice(0, 10)}`,
    );
    if (keyTopics.length > 0) {
      summaryParts.push(`Topics: ${keyTopics.slice(0, 5).join(', ')}`);
    }
    summaryParts.push(`Started: ${firstSnippet}`);
    summaryParts.push(`Ended: ${lastSnippet}`);
  }

  let summary = summaryParts.join('. ');
  if (summary.length > maxLength) {
    summary = `${summary.slice(0, maxLength - 3)  }...`;
  }

  const charsSaved = combinedText.length - summary.length;
  const compressionRatio = combinedText.length > 0 ? charsSaved / combinedText.length : 0;

  return {
    sourceIds: group.map((e) => e.id),
    summary,
    sourceCount: group.length,
    charsSaved: Math.max(0, charsSaved),
    compressionRatio: Math.max(0, Math.min(1, compressionRatio)),
    startTime,
    endTime,
    keyTopics,
  };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)  }...`;
}

// ---------------------------------------------------------------------------
// Summarizer
// ---------------------------------------------------------------------------

export class MemorySummarizer {
  private config: Required<SummarizerConfig>;
  private embedder: EmbeddingProvider | null;

  constructor(config?: Partial<SummarizerConfig>, embedder?: EmbeddingProvider) {
    this.config = {
      maxSummaryLength: config?.maxSummaryLength ?? 300,
      minGroupSize: config?.minGroupSize ?? 3,
      importanceThreshold: config?.importanceThreshold ?? 0.6,
      preserveTopN: config?.preserveTopN ?? 2,
    };
    this.embedder = embedder ?? null;
  }

  /**
   * Summarize a list of entries: group them, build summaries, return
   * SummarizationResult with new summary entries.
   */
  async summarize(
    entries: CompressableMemoryEntry[],
    options?: { tier?: 'warm' | 'cold'; includeEmbeddings?: boolean },
  ): Promise<SummarizationResult> {
    const targetTier = options?.tier ?? 'warm';
    const includeEmbeddings = options?.includeEmbeddings ?? true;

    if (entries.length === 0) {
      return {
        groups: [],
        before: 0,
        after: 0,
        charsBefore: 0,
        charsAfter: 0,
        compressionRatio: 0,
        summaries: [],
      };
    }

    const before = entries.length;
    const charsBefore = entries.reduce((s, e) => s + e.content.length, 0);

    // 1. Pick out the top N most-important entries to keep verbatim
    const sortedByImportance = [...entries].sort((a, b) => b.importance - a.importance);
    const preserved = new Set(
      sortedByImportance.slice(0, this.config.preserveTopN).map((e) => e.id),
    );

    // 2. Filter out low-importance entries
    const candidates = entries.filter(
      (e) => !preserved.has(e.id) && e.importance < this.config.importanceThreshold,
    );

    // 3. Group by temporal + tag/session proximity
    const groups = groupByProximity(candidates, this.config.minGroupSize);

    // 4. Build summaries
    const summaryEntries: CompressableMemoryEntry[] = [];
    const builtGroups: SummaryGroup[] = [];

    for (const g of groups) {
      const summary = buildSummary(g, this.config.maxSummaryLength);
      builtGroups.push(summary);

      const gFirst = g[0];
      if (!gFirst) continue;

      const newEntry: CompressableMemoryEntry = {
        id: `summary_${summary.startTime}_${gFirst.id}`,
        type: 'conversation',
        content: summary.summary,
        timestamp: summary.endTime,
        tier: targetTier,
        accessCount: 0,
        lastAccessedAt: Date.now(),
        importance: this.computeGroupImportance(g),
        isSummary: true,
        summarizedFrom: summary.sourceIds,
        tags: Array.from(new Set(g.flatMap((e) => e.tags ?? []))),
        sessionId: gFirst.sessionId,
      };

      if (includeEmbeddings) {
        newEntry.embedding = await this.embedSummary(summary.summary);
      }

      summaryEntries.push(newEntry);
    }

    // 5. The "after" count is: preserved + summarized groups
    const after = this.config.preserveTopN + summaryEntries.length;
    const charsAfter = summaryEntries.reduce((s, e) => s + e.content.length, 0);
    const totalCharsAfter =
      charsAfter +
      sortedByImportance
        .slice(0, this.config.preserveTopN)
        .reduce((s, e) => s + e.content.length, 0);
    const compressionRatio =
      charsBefore > 0 ? Math.max(0, (charsBefore - totalCharsAfter) / charsBefore) : 0;

    return {
      groups: builtGroups,
      before,
      after,
      charsBefore,
      charsAfter: totalCharsAfter,
      compressionRatio,
      summaries: summaryEntries,
    };
  }

  /** Build a single summary for a session (used by session summarization). */
  async summarizeSession(
    sessionId: string,
    entries: CompressableMemoryEntry[],
  ): Promise<SummaryGroup | null> {
    const filtered = entries.filter((e) => e.sessionId === sessionId);
    if (filtered.length < this.config.minGroupSize) return null;
    const [first] = filtered;
    if (!first) return null;
    return buildSummary(filtered, this.config.maxSummaryLength);
  }

  private computeGroupImportance(group: CompressableMemoryEntry[]): number {
    if (group.length === 0) return 0;
    const sum = group.reduce((s, e) => s + e.importance, 0);
    return Math.min(1, (sum / group.length) * 1.2);
  }

  private async embedSummary(text: string): Promise<number[] | undefined> {
    if (!this.embedder) return undefined;
    try {
      return await this.embedder.embed(text);
    } catch {
      return undefined;
    }
  }
}
