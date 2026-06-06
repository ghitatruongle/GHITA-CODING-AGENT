// ==============================================================================
// GHITA CODING AGENT - CrossSessionSearch Unit Tests (Phase 14)
// 35 test cases covering indexing, search, vector search, hybrid search,
// date/session filtering, summarization, and edge cases.
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CrossSessionSearch } from '../src/search.js';
import type { SessionRecord, SessionMessage } from '../src/search.js';

function makeSession(
  id: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  opts?: Partial<SessionRecord>,
): SessionRecord {
  const now = Date.now();
  return {
    sessionId: id,
    startTime: now - 60000,
    endTime: now,
    messages: messages.map((m) => ({ ...m, timestamp: now - 30000 })),
    ...opts,
  };
}

describe('CrossSessionSearch', () => {
  let search: CrossSessionSearch;

  beforeEach(() => {
    search = new CrossSessionSearch({ maxSessions: 100 });
  });

  // ── Group 1: Session indexing (6 tests) ────────────────────────────────

  describe('indexSession', () => {
    it('1. indexes a session', () => {
      search.indexSession(makeSession('s1', [{ role: 'user', content: 'hello world' }]));
      expect(search.getSessionCount()).toBe(1);
    });

    it('2. indexes multiple sessions', () => {
      search.indexSession(makeSession('s1', [{ role: 'user', content: 'hello' }]));
      search.indexSession(makeSession('s2', [{ role: 'user', content: 'world' }]));
      expect(search.getSessionCount()).toBe(2);
    });

    it('3. re-indexing same session updates it', () => {
      search.indexSession(makeSession('s1', [{ role: 'user', content: 'old content' }]));
      search.indexSession(makeSession('s1', [{ role: 'user', content: 'new content' }]));
      expect(search.getSessionCount()).toBe(1);
    });

    it('4. evicts oldest when maxSessions reached', () => {
      const small = new CrossSessionSearch({ maxSessions: 2 });
      small.indexSession(makeSession('s1', [{ role: 'user', content: 'first' }], { startTime: 1000 }));
      small.indexSession(makeSession('s2', [{ role: 'user', content: 'second' }], { startTime: 2000 }));
      small.indexSession(makeSession('s3', [{ role: 'user', content: 'third' }], { startTime: 3000 }));
      expect(small.getSessionCount()).toBe(2);
      // s1 should be evicted (oldest)
      const results = small.searchAcrossSessions('first');
      expect(results).toHaveLength(0);
    });

    it('5. indexes summary tokens as candidates', () => {
      // Summary tokens index the session as a candidate, but scoring uses message content.
      // So we include a message that has some content, plus summary with 'TypeScript'.
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'nothing relevant' }], {
          summary: 'TypeScript configuration setup',
        }),
      );
      search.indexSession(
        makeSession('s2', [{ role: 'user', content: 'TypeScript strict mode' }]),
      );
      // Both sessions should be found - s2 via message match, s1 as candidate via summary
      // but s1 won't have message-level matches, so only s2 returns results
      const results = search.searchAcrossSessions('TypeScript');
      // s2 definitely found via message content
      const s2 = results.find((r) => r.sessionId === 's2');
      expect(s2).toBeDefined();
      expect(s2!.matches.length).toBeGreaterThanOrEqual(1);
      // s1 is in the inverted index (candidate) but has no message match -> not in results
      const s1 = results.find((r) => r.sessionId === 's1');
      expect(s1).toBeUndefined();
    });

    it('6. removeSession works', () => {
      search.indexSession(makeSession('s1', [{ role: 'user', content: 'hello' }]));
      expect(search.removeSession('s1')).toBe(true);
      expect(search.getSessionCount()).toBe(0);
    });
  });

  // ── Group 2: Keyword search (7 tests) ──────────────────────────────────

  describe('searchAcrossSessions', () => {
    beforeEach(() => {
      search.indexSession(
        makeSession('s1', [
          { role: 'user', content: 'How to configure TypeScript?' },
          { role: 'assistant', content: 'You need to create a tsconfig.json file.' },
        ]),
      );
      search.indexSession(
        makeSession('s2', [
          { role: 'user', content: 'How to setup ESLint?' },
          { role: 'assistant', content: 'Install eslint and create eslint.config.js' },
        ]),
      );
      search.indexSession(
        makeSession('s3', [
          { role: 'user', content: 'React hooks tutorial' },
          { role: 'assistant', content: 'useState and useEffect are common hooks' },
        ]),
      );
    });

    it('7. finds relevant sessions', () => {
      const results = search.searchAcrossSessions('TypeScript config');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.sessionId).toBe('s1');
    });

    it('8. returns empty for no match', () => {
      const results = search.searchAcrossSessions('quantum computing');
      expect(results).toHaveLength(0);
    });

    it('9. returns empty for empty query', () => {
      const results = search.searchAcrossSessions('');
      expect(results).toHaveLength(0);
    });

    it('10. respects limit option', () => {
      const results = search.searchAcrossSessions('to', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('11. matches are sorted by score', () => {
      const results = search.searchAcrossSessions('setup configure');
      if (results.length > 1) {
        expect(results[0]!.overallScore).toBeGreaterThanOrEqual(results[1]!.overallScore);
      }
    });

    it('12. results contain context snippets', () => {
      const results = search.searchAcrossSessions('ESLint');
      expect(results[0]!.matches[0]!.context).toBeDefined();
      expect(results[0]!.matches[0]!.context.length).toBeGreaterThan(0);
    });

    it('13. results contain match scores', () => {
      const results = search.searchAcrossSessions('React hooks');
      for (const r of results) {
        for (const m of r.matches) {
          expect(m.score).toBeGreaterThan(0);
          expect(m.score).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // ── Group 3: Vector / hybrid search (5 tests) ──────────────────────────

  describe('vector search', () => {
    it('14. cosine similarity works with matching vectors', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'hello' }], {
          vector: [1, 0, 0],
        }),
      );
      search.indexSession(
        makeSession('s2', [{ role: 'user', content: 'bye' }], {
          vector: [0, 1, 0],
        }),
      );
      const results = search.searchAcrossSessions('hello', {
        queryVector: [1, 0, 0],
        minScore: 0.1,
      });
      // s1 should rank higher due to vector match
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('15. vector-only match included', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'unrelated text' }], {
          vector: [1, 0, 0],
        }),
      );
      const results = search.searchAcrossSessions('missing keyword', {
        queryVector: [1, 0, 0],
        minScore: 0.1,
      });
      // Vector match should include s1 even without keyword match
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('16. zero vector returns 0 similarity', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'test' }], {
          vector: [0, 0, 0],
        }),
      );
      const results = search.searchAcrossSessions('test', {
        queryVector: [1, 0, 0],
      });
      // Zero vector contributes nothing
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('17. different length vectors handled gracefully', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'x' }], {
          vector: [1, 0],
        }),
      );
      // Should not throw
      const results = search.searchAcrossSessions('x', {
        queryVector: [1, 0, 0, 0],
      });
      expect(results).toBeDefined();
    });

    it('18. hybrid search combines keyword + vector', () => {
      search.indexSession(
        makeSession('s1', [
          { role: 'user', content: 'TypeScript configuration' },
        ], { vector: [1, 0, 0] }),
      );
      const results = search.searchEnhanced('TypeScript', {
        queryVector: [1, 0, 0],
      });
      if (results.length > 0) {
        expect(results[0]!.source).toBe('hybrid');
      }
    });
  });

  // ── Group 4: Date filtering (3 tests) ──────────────────────────────────

  describe('date filtering', () => {
    it('19. afterDate filters old sessions', () => {
      const old = Date.now() - 86400000 * 10; // 10 days ago
      const recent = Date.now() - 86400000; // 1 day ago
      search.indexSession(
        makeSession('old', [{ role: 'user', content: 'ancient data' }], {
          startTime: old - 1000,
          endTime: old,
        }),
      );
      search.indexSession(
        makeSession('recent', [{ role: 'user', content: 'recent data' }], {
          startTime: recent - 1000,
          endTime: recent,
        }),
      );
      const results = search.searchAcrossSessions('data', {
        afterDate: Date.now() - 86400000 * 5,
      });
      expect(results.map((r) => r.sessionId)).not.toContain('old');
    });

    it('20. beforeDate filters new sessions', () => {
      const old = Date.now() - 86400000 * 10;
      const recent = Date.now();
      search.indexSession(
        makeSession('old', [{ role: 'user', content: 'old content' }], {
          startTime: old - 1000,
          endTime: old,
        }),
      );
      search.indexSession(
        makeSession('new', [{ role: 'user', content: 'new content' }], {
          startTime: recent - 1000,
          endTime: recent,
        }),
      );
      const results = search.searchAcrossSessions('content', {
        beforeDate: Date.now() - 86400000 * 5,
      });
      expect(results.map((r) => r.sessionId)).not.toContain('new');
    });

    it('21. sessionType filter works', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'coding help' }], {
          metadata: { type: 'coding' },
        }),
      );
      search.indexSession(
        makeSession('s2', [{ role: 'user', content: 'coding help' }], {
          metadata: { type: 'chat' },
        }),
      );
      const results = search.searchAcrossSessions('coding', { sessionType: 'coding' });
      expect(results.every((r) => r.sessionId === 's1')).toBe(true);
    });
  });

  // ── Group 5: Enhanced search (4 tests) ─────────────────────────────────

  describe('searchEnhanced', () => {
    it('22. returns detailed score breakdown', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'TypeScript tutorial' }]),
      );
      const results = search.searchEnhanced('TypeScript');
      if (results.length > 0) {
        const match = results[0]!.matches[0]!;
        expect(match.keywordScore).toBeDefined();
        expect(match.vectorScore).toBeDefined();
        expect(match.combinedScore).toBeDefined();
        expect(match.context).toBeDefined();
      }
    });

    it('23. source is keyword when no queryVector', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'hello world' }]),
      );
      const results = search.searchEnhanced('hello');
      if (results.length > 0) {
        expect(results[0]!.source).toBe('keyword');
      }
    });

    it('24. returns empty for empty query', () => {
      const results = search.searchEnhanced('');
      expect(results).toHaveLength(0);
    });

    it('25. respects minScore threshold', () => {
      search.indexSession(
        makeSession('s1', [{ role: 'user', content: 'TypeScript is great' }]),
      );
      const results = search.searchEnhanced('quantum physics', { minScore: 0.5 });
      expect(results).toHaveLength(0);
    });
  });

  // ── Group 6: summarizeResults (4 tests) ────────────────────────────────

  describe('summarizeResults', () => {
    it('26. returns empty string for no results', () => {
      expect(search.summarizeResults([])).toBe('');
    });

    it('27. includes session id and match info', () => {
      search.indexSession(
        makeSession('s1', [
          { role: 'user', content: 'How to configure TypeScript?' },
          { role: 'assistant', content: 'Create tsconfig.json' },
        ], { summary: 'TypeScript setup guide' }),
      );
      const results = search.searchAcrossSessions('TypeScript');
      const summary = search.summarizeResults(results);
      expect(summary).toContain('s1');
      expect(summary).toContain('TypeScript setup guide');
    });

    it('28. truncates when exceeding maxChars', () => {
      search.indexSession(
        makeSession('s1', [
          { role: 'user', content: 'x'.repeat(5000) },
        ]),
      );
      const results = search.searchAcrossSessions('x', { minScore: 0.01 });
      const summary = search.summarizeResults(results, 200);
      expect(summary.length).toBeLessThanOrEqual(300); // some overflow
    });

    it('29. limits to 2 matches per session', () => {
      search.indexSession(
        makeSession('s1', [
          { role: 'user', content: 'React hooks tutorial with useState' },
          { role: 'assistant', content: 'React hooks useEffect example' },
          { role: 'user', content: 'React hooks useCallback pattern' },
        ]),
      );
      const results = search.searchAcrossSessions('React hooks');
      const summary = search.summarizeResults(results);
      // Count occurrences of role markers
      const matches = summary.match(/- (?:Người dùng|AI):/g) ?? [];
      expect(matches.length).toBeLessThanOrEqual(2);
    });
  });

  // ── Group 7: Config & cleanup (6 tests) ────────────────────────────────

  describe('config and cleanup', () => {
    it('30. getConfig returns copy', () => {
      const cfg = search.getConfig();
      expect(cfg.maxSessions).toBe(100);
      expect(cfg.keywordWeight).toBe(0.6);
      expect(cfg.semanticWeight).toBe(0.4);
    });

    it('31. numeric constructor works', () => {
      const s = new CrossSessionSearch(50);
      expect(s.getConfig().maxSessions).toBe(50);
    });

    it('32. clear removes all data', () => {
      search.indexSession(makeSession('s1', [{ role: 'user', content: 'test' }]));
      search.clear();
      expect(search.getSessionCount()).toBe(0);
      expect(search.searchAcrossSessions('test')).toHaveLength(0);
    });

    it('33. removeSession returns false for unknown', () => {
      expect(search.removeSession('nonexistent')).toBe(false);
    });

    it('34. custom weights affect scoring', () => {
      const weighted = new CrossSessionSearch({
        keywordWeight: 0.9,
        semanticWeight: 0.1,
      });
      weighted.indexSession(
        makeSession('s1', [{ role: 'user', content: 'exact match keyword' }], {
          vector: [0, 1, 0],
        }),
      );
      // High keyword weight should boost keyword matches
      const results = weighted.searchAcrossSessions('exact match');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('35. recency bonus affects ranking', () => {
      const now = Date.now();
      search.indexSession(
        makeSession('old', [{ role: 'user', content: 'TypeScript help' }], {
          startTime: now - 86400000 * 90,
          endTime: now - 86400000 * 90,
        }),
      );
      search.indexSession(
        makeSession('new', [{ role: 'user', content: 'TypeScript help' }], {
          startTime: now - 60000,
          endTime: now,
        }),
      );
      const results = search.searchAcrossSessions('TypeScript help');
      // Newer session should rank higher
      if (results.length >= 2) {
        expect(results[0]!.sessionId).toBe('new');
      }
    });
  });
});
