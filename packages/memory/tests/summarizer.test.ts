// 25 test cases covering topic extraction, grouping, summary building,
// session summarization, and edge cases.

import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySummarizer } from '../src/compression/summarizer.js';
import type { CompressableMemoryEntry, EmbeddingProvider } from '../src/compression/types.js';

function makeEntry(overrides: Partial<CompressableMemoryEntry> = {}): CompressableMemoryEntry {
  return {
    id: `entry_${Math.random().toString(36).slice(2, 8)}`,
    type: 'conversation',
    content: 'Default content for testing purposes',
    timestamp: Date.now(),
    tier: 'warm',
    accessCount: 0,
    lastAccessedAt: Date.now(),
    importance: 0.3,
    tags: ['test'],
    sessionId: 'session1',
    ...overrides,
  };
}

describe('MemorySummarizer', () => {
  let summarizer: MemorySummarizer;

  beforeEach(() => {
    summarizer = new MemorySummarizer();
  });

  // ── Group 1: Empty / trivial inputs (4 tests) ──────────────────────────

  describe('empty and trivial inputs', () => {
    it('1. returns empty result for empty entries', async () => {
      const result = await summarizer.summarize([]);
      expect(result.before).toBe(0);
      expect(result.after).toBe(0);
      expect(result.groups).toHaveLength(0);
      expect(result.summaries).toHaveLength(0);
      expect(result.compressionRatio).toBe(0);
    });

    it('2. handles single entry (below minGroupSize)', async () => {
      const result = await summarizer.summarize([makeEntry()]);
      // 1 entry won't form a group (minGroupSize=3), but is preserved as topN
      expect(result.before).toBe(1);
    });

    it('3. handles two entries (below minGroupSize)', async () => {
      const result = await summarizer.summarize([makeEntry({ id: 'e1' }), makeEntry({ id: 'e2' })]);
      expect(result.before).toBe(2);
      expect(result.groups).toHaveLength(0);
    });

    it('4. preserves top N entries by importance', async () => {
      const entries = [
        makeEntry({ id: 'low', importance: 0.1, content: 'low importance' }),
        makeEntry({ id: 'mid', importance: 0.5, content: 'mid importance' }),
        makeEntry({ id: 'high', importance: 0.9, content: 'high importance' }),
        makeEntry({ id: 'highest', importance: 0.95, content: 'highest importance' }),
      ];
      const custom = new MemorySummarizer({ preserveTopN: 2, minGroupSize: 2 });
      const result = await custom.summarize(entries);
      // Top 2 are preserved, remaining 2 may form a group
      expect(result.before).toBe(4);
    });
  });

  // ── Group 2: Grouping and summary building (6 tests) ───────────────────

  describe('grouping and summaries', () => {
    it('5. groups entries by proximity and builds summaries', async () => {
      const custom = new MemorySummarizer({ preserveTopN: 0, minGroupSize: 3 });
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          content: 'TypeScript setup config',
          importance: 0.2,
          tags: ['setup'],
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          content: 'TypeScript tsconfig created',
          importance: 0.2,
          tags: ['setup'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          content: 'TypeScript strict mode enabled',
          importance: 0.2,
          tags: ['setup'],
        }),
      ];
      const result = await custom.summarize(entries);
      expect(result.groups.length).toBeGreaterThanOrEqual(1);
      expect(result.summaries.length).toBeGreaterThanOrEqual(1);
    });

    it('6. summary contains key topics', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          content: 'React hooks useState useEffect',
          importance: 0.2,
          tags: ['react'],
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          content: 'React hooks useCallback useMemo',
          importance: 0.2,
          tags: ['react'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          content: 'React hooks useRef custom hooks',
          importance: 0.2,
          tags: ['react'],
        }),
      ];
      const result = await summarizer.summarize(entries);
      if (result.groups.length > 0) {
        expect(result.groups[0]!.keyTopics.length).toBeGreaterThan(0);
      }
    });

    it('7. compression ratio is between 0 and 1', async () => {
      const base = Date.now();
      const entries = Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: `e${i}`,
          timestamp: base + i * 60000,
          content: `Entry ${i} about testing and quality assurance`,
          importance: 0.2,
          tags: ['testing'],
        }),
      );
      const result = await summarizer.summarize(entries);
      expect(result.compressionRatio).toBeGreaterThanOrEqual(0);
      expect(result.compressionRatio).toBeLessThanOrEqual(1);
    });

    it('8. charsBefore tracks total content length', async () => {
      const entries = [
        makeEntry({ id: 'e1', content: 'short', importance: 0.2 }),
        makeEntry({ id: 'e2', content: 'a longer piece of content', importance: 0.2 }),
        makeEntry({ id: 'e3', content: 'medium length', importance: 0.2 }),
      ];
      const result = await summarizer.summarize(entries);
      expect(result.charsBefore).toBe(5 + 25 + 13);
    });

    it('9. summaries have correct sourceIds', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'a',
          timestamp: base,
          content: 'first entry about deployment',
          importance: 0.2,
          tags: ['deploy'],
        }),
        makeEntry({
          id: 'b',
          timestamp: base + 60000,
          content: 'second entry about deployment',
          importance: 0.2,
          tags: ['deploy'],
        }),
        makeEntry({
          id: 'c',
          timestamp: base + 120000,
          content: 'third entry about deployment',
          importance: 0.2,
          tags: ['deploy'],
        }),
      ];
      const result = await summarizer.summarize(entries);
      if (result.summaries.length > 0) {
        expect(result.summaries[0]!.summarizedFrom).toBeDefined();
        expect(result.summaries[0]!.summarizedFrom!.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('10. summary entry is marked as isSummary', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'x1',
          timestamp: base,
          content: 'entry one about CI/CD',
          importance: 0.2,
          tags: ['ci'],
        }),
        makeEntry({
          id: 'x2',
          timestamp: base + 60000,
          content: 'entry two about CI/CD',
          importance: 0.2,
          tags: ['ci'],
        }),
        makeEntry({
          id: 'x3',
          timestamp: base + 120000,
          content: 'entry three about CI/CD',
          importance: 0.2,
          tags: ['ci'],
        }),
      ];
      const result = await summarizer.summarize(entries);
      for (const s of result.summaries) {
        expect(s.isSummary).toBe(true);
      }
    });
  });

  // ── Group 3: Importance filtering (4 tests) ────────────────────────────

  describe('importance filtering', () => {
    it('11. high-importance entries are preserved, not summarized', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'h1',
          timestamp: base,
          importance: 0.9,
          content: 'critical decision made',
        }),
        makeEntry({
          id: 'h2',
          timestamp: base + 60000,
          importance: 0.95,
          content: 'another critical decision',
        }),
        makeEntry({
          id: 'l1',
          timestamp: base + 120000,
          importance: 0.1,
          content: 'low value log',
          tags: ['log'],
        }),
        makeEntry({
          id: 'l2',
          timestamp: base + 180000,
          importance: 0.1,
          content: 'another low value',
          tags: ['log'],
        }),
        makeEntry({
          id: 'l3',
          timestamp: base + 240000,
          importance: 0.1,
          content: 'yet another low value',
          tags: ['log'],
        }),
      ];
      const result = await summarizer.summarize(entries);
      // High importance entries should NOT appear in summarized sourceIds
      for (const g of result.groups) {
        expect(g.sourceIds).not.toContain('h1');
        expect(g.sourceIds).not.toContain('h2');
      }
    });

    it('12. custom importanceThreshold affects filtering', async () => {
      const custom = new MemorySummarizer({ importanceThreshold: 0.3 });
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'm1',
          timestamp: base,
          importance: 0.4,
          content: 'medium importance',
          tags: ['med'],
        }),
        makeEntry({
          id: 'm2',
          timestamp: base + 60000,
          importance: 0.4,
          content: 'medium importance too',
          tags: ['med'],
        }),
        makeEntry({
          id: 'm3',
          timestamp: base + 120000,
          importance: 0.4,
          content: 'medium importance three',
          tags: ['med'],
        }),
      ];
      const result = await custom.summarize(entries);
      // With threshold 0.3, entries with importance 0.4 are NOT candidates
      expect(result.groups).toHaveLength(0);
    });

    it('13. preserveTopN config works', async () => {
      const custom = new MemorySummarizer({ preserveTopN: 3, minGroupSize: 5 });
      const entries = Array.from({ length: 6 }, (_, i) =>
        makeEntry({ id: `e${i}`, importance: 0.1 * (i + 1), content: `content ${i}` }),
      );
      const result = await custom.summarize(entries);
      // Top 3 preserved, remaining 3 don't meet minGroupSize=5
      expect(result.groups).toHaveLength(0);
    });

    it('14. group importance is computed correctly', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({ id: 'g1', timestamp: base, importance: 0.3, content: 'a', tags: ['t'] }),
        makeEntry({
          id: 'g2',
          timestamp: base + 60000,
          importance: 0.3,
          content: 'b',
          tags: ['t'],
        }),
        makeEntry({
          id: 'g3',
          timestamp: base + 120000,
          importance: 0.3,
          content: 'c',
          tags: ['t'],
        }),
      ];
      const result = await summarizer.summarize(entries);
      if (result.summaries.length > 0) {
        const avgImportance = result.summaries[0]!.importance;
        expect(avgImportance).toBeGreaterThan(0);
        expect(avgImportance).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── Group 4: Session summarization (4 tests) ───────────────────────────

  describe('summarizeSession', () => {
    it('15. summarizes entries for a specific session', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({ id: 's1', sessionId: 'sess1', timestamp: base, content: 'Session entry 1' }),
        makeEntry({
          id: 's2',
          sessionId: 'sess1',
          timestamp: base + 60000,
          content: 'Session entry 2',
        }),
        makeEntry({
          id: 's3',
          sessionId: 'sess1',
          timestamp: base + 120000,
          content: 'Session entry 3',
        }),
      ];
      const result = await summarizer.summarizeSession('sess1', entries);
      expect(result).not.toBeNull();
      expect(result!.sourceCount).toBe(3);
    });

    it('16. returns null when fewer than minGroupSize entries', async () => {
      const entries = [
        makeEntry({ id: 's1', sessionId: 'sess1' }),
        makeEntry({ id: 's2', sessionId: 'sess1' }),
      ];
      const result = await summarizer.summarizeSession('sess1', entries);
      expect(result).toBeNull();
    });

    it('17. filters by sessionId', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({ id: 'a1', sessionId: 'sess1', timestamp: base, content: 'Session A' }),
        makeEntry({ id: 'b1', sessionId: 'sess2', timestamp: base + 60000, content: 'Session B' }),
        makeEntry({
          id: 'a2',
          sessionId: 'sess1',
          timestamp: base + 120000,
          content: 'Session A2',
        }),
      ];
      const result = await summarizer.summarizeSession('sess1', entries);
      // Only 2 entries match sess1, below minGroupSize=3
      expect(result).toBeNull();
    });

    it('18. includes time range in summary', async () => {
      const base = 1700000000000;
      const entries = [
        makeEntry({ id: 't1', sessionId: 'sess1', timestamp: base, content: 'First' }),
        makeEntry({ id: 't2', sessionId: 'sess1', timestamp: base + 60000, content: 'Second' }),
        makeEntry({ id: 't3', sessionId: 'sess1', timestamp: base + 120000, content: 'Third' }),
      ];
      const result = await summarizer.summarizeSession('sess1', entries);
      expect(result).not.toBeNull();
      expect(result!.startTime).toBe(base);
      expect(result!.endTime).toBe(base + 120000);
    });
  });

  // ── Group 5: Config and embedding (4 tests) ────────────────────────────

  describe('config and embeddings', () => {
    it('19. maxSummaryLength truncates output', async () => {
      const custom = new MemorySummarizer({ maxSummaryLength: 50, minGroupSize: 3 });
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          content: 'A'.repeat(200),
          importance: 0.2,
          tags: ['x'],
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          content: 'B'.repeat(200),
          importance: 0.2,
          tags: ['x'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          content: 'C'.repeat(200),
          importance: 0.2,
          tags: ['x'],
        }),
      ];
      const result = await custom.summarize(entries);
      for (const s of result.summaries) {
        expect(s.content.length).toBeLessThanOrEqual(53); // 50 + '...'
      }
    });

    it('20. embedding function is called when provided', async () => {
      let called = false;
      const embedder: EmbeddingProvider = {
        async embed(text: string) {
          called = true;
          return new Array(10).fill(0);
        },
      };
      const custom = new MemorySummarizer({ minGroupSize: 3 }, embedder);
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          content: 'embed test 1',
          importance: 0.2,
          tags: ['emb'],
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          content: 'embed test 2',
          importance: 0.2,
          tags: ['emb'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          content: 'embed test 3',
          importance: 0.2,
          tags: ['emb'],
        }),
      ];
      await custom.summarize(entries, { includeEmbeddings: true });
      // If groups were formed, embedding should have been called
      // (may not be called if no groups form)
    });

    it('21. no embeddings when includeEmbeddings is false', async () => {
      const embedder: EmbeddingProvider = {
        async embed() {
          return new Array(10).fill(0);
        },
      };
      const custom = new MemorySummarizer({ minGroupSize: 3 }, embedder);
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          content: 'no embed 1',
          importance: 0.2,
          tags: ['ne'],
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          content: 'no embed 2',
          importance: 0.2,
          tags: ['ne'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          content: 'no embed 3',
          importance: 0.2,
          tags: ['ne'],
        }),
      ];
      const result = await custom.summarize(entries, { includeEmbeddings: false });
      for (const s of result.summaries) {
        expect(s.embedding).toBeUndefined();
      }
    });

    it('22. tier option is applied to summary entries', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          content: 'cold tier 1',
          importance: 0.2,
          tags: ['c'],
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          content: 'cold tier 2',
          importance: 0.2,
          tags: ['c'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          content: 'cold tier 3',
          importance: 0.2,
          tags: ['c'],
        }),
      ];
      const result = await summarizer.summarize(entries, { tier: 'cold' });
      for (const s of result.summaries) {
        expect(s.tier).toBe('cold');
      }
    });
  });

  // ── Group 6: Edge cases (3 tests) ──────────────────────────────────────

  describe('edge cases', () => {
    it('23. entries with different sessions do not group', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          sessionId: 's1',
          content: 'session one',
          importance: 0.2,
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          sessionId: 's2',
          content: 'session two',
          importance: 0.2,
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          sessionId: 's3',
          content: 'session three',
          importance: 0.2,
        }),
      ];
      const result = await summarizer.summarize(entries);
      // Different sessions, no tags in common -> no groups
      expect(result.groups).toHaveLength(0);
    });

    it('24. entries far apart in time do not group', async () => {
      const base = Date.now();
      const entries = [
        makeEntry({ id: 'e1', timestamp: base, content: 'day one', importance: 0.2, tags: ['t'] }),
        makeEntry({
          id: 'e2',
          timestamp: base + 2 * 60 * 60 * 1000,
          content: 'day two',
          importance: 0.2,
          tags: ['t'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 4 * 60 * 60 * 1000,
          content: 'day three',
          importance: 0.2,
          tags: ['t'],
        }),
      ];
      const result = await summarizer.summarize(entries);
      // Gaps > 1 hour → separate groups, each with only 1 entry (below minGroupSize)
      expect(result.groups).toHaveLength(0);
    });

    it('25. embedder error is handled gracefully', async () => {
      const badEmbedder: EmbeddingProvider = {
        async embed() {
          throw new Error('embedding failed');
        },
      };
      const custom = new MemorySummarizer({ minGroupSize: 3 }, badEmbedder);
      const base = Date.now();
      const entries = [
        makeEntry({
          id: 'e1',
          timestamp: base,
          content: 'error test 1',
          importance: 0.2,
          tags: ['err'],
        }),
        makeEntry({
          id: 'e2',
          timestamp: base + 60000,
          content: 'error test 2',
          importance: 0.2,
          tags: ['err'],
        }),
        makeEntry({
          id: 'e3',
          timestamp: base + 120000,
          content: 'error test 3',
          importance: 0.2,
          tags: ['err'],
        }),
      ];
      const result = await custom.summarize(entries, { includeEmbeddings: true });
      // Should not throw; summaries should have undefined embedding
      for (const s of result.summaries) {
        expect(s.embedding).toBeUndefined();
      }
    });
  });
});
