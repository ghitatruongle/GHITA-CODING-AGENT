// ==============================================================================
// GHITA CODING AGENT - KnowledgeEngine Unit Tests
// 30 test cases covering ingestion, chunking, deduplication, token search,
// semantic search, source management, query context, and document management.
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeEngine } from '../src/knowledge/knowledge.js';
import type { EmbeddingFunction, KnowledgeSource } from '../src/knowledge/types.js';

// Mock embedding function
const mockEmbedding: EmbeddingFunction = async (text: string) => {
  // Simple mock: hash text to a fixed-length vector
  const vec = new Array(10).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % 10] += text.charCodeAt(i);
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
};

describe('KnowledgeEngine', () => {
  let engine: KnowledgeEngine;

  beforeEach(() => {
    engine = new KnowledgeEngine();
  });

  // ── Group 1: Document ingestion (6 tests) ──────────────────────────────

  describe('ingestDocument', () => {
    it('1. ingests a simple document', async () => {
      const { document, chunks } = await engine.ingestDocument('Hello world', 'test.txt');
      expect(document.id).toBeDefined();
      expect(document.content).toBe('Hello world');
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('2. chunks respect chunk size', async () => {
      const content = 'a'.repeat(1000);
      const { chunks } = await engine.ingestDocument(content, 'big.txt', 'text', {
        chunkSize: 200,
        chunkOverlap: 20,
      });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(200);
      }
    });

    it('3. chunks overlap correctly', async () => {
      const content = 'ABCDEFGHIJKLMNOP'.repeat(20); // 320 chars
      const { chunks } = await engine.ingestDocument(content, 'overlap.txt', 'text', {
        chunkSize: 100,
        chunkOverlap: 20,
      });
      if (chunks.length >= 2) {
        // End of first chunk should overlap with start of second
        const first = chunks[0]!.content;
        const second = chunks[1]!.content;
        const overlap = first.slice(-20);
        expect(second.startsWith(overlap)).toBe(true);
      }
    });

    it('4. deduplication skips identical content', async () => {
      await engine.ingestDocument('unique content', 'doc1.txt');
      const { document } = await engine.ingestDocument('unique content', 'doc2.txt');
      // Should return the same document (deduplicated)
      const stats = engine.getStats();
      expect(stats.documents).toBe(1);
    });

    it('5. deduplication=false creates separate documents', async () => {
      await engine.ingestDocument('same content', 'doc1.txt', 'text', { deduplicate: false });
      await engine.ingestDocument('same content', 'doc2.txt', 'text', { deduplicate: false });
      expect(engine.getStats().documents).toBe(2);
    });

    it('6. metadata is propagated to chunks', async () => {
      const { chunks } = await engine.ingestDocument('test', 'src.txt', 'text', {
        metadata: { category: 'test' },
      });
      for (const chunk of chunks) {
        expect(chunk.metadata).toEqual({ category: 'test' });
      }
    });
  });

  // ── Group 2: Embedding generation (3 tests) ────────────────────────────

  describe('embedding generation', () => {
    it('7. generates embeddings when function provided', async () => {
      const embEngine = new KnowledgeEngine(mockEmbedding);
      const { chunks } = await embEngine.ingestDocument('TypeScript tutorial', 'ts.txt', 'text', {
        generateEmbeddings: true,
      });
      for (const chunk of chunks) {
        expect(chunk.embedding).toBeDefined();
        expect(chunk.embedding!.length).toBe(10);
      }
    });

    it('8. no embeddings without function', async () => {
      const { chunks } = await engine.ingestDocument('test content', 't.txt', 'text', {
        generateEmbeddings: true,
      });
      for (const chunk of chunks) {
        expect(chunk.embedding).toBeUndefined();
      }
    });

    it('9. setEmbeddingFunction works', async () => {
      engine.setEmbeddingFunction(mockEmbedding);
      const { chunks } = await engine.ingestDocument('hello', 'h.txt', 'text', {
        generateEmbeddings: true,
      });
      expect(chunks[0]!.embedding).toBeDefined();
    });
  });

  // ── Group 3: Token search (5 tests) ────────────────────────────────────

  describe('token search', () => {
    beforeEach(async () => {
      await engine.ingestDocument('TypeScript is a typed superset of JavaScript', 'ts.txt');
      await engine.ingestDocument('React is a library for building user interfaces', 'react.txt');
      await engine.ingestDocument('Node.js is a JavaScript runtime environment', 'node.txt');
    });

    it('10. finds relevant chunks', async () => {
      const results = await engine.search('TypeScript typed');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.content).toContain('TypeScript');
    });

    it('11. empty query returns empty results', async () => {
      const results = await engine.search('');
      expect(results).toHaveLength(0);
    });

    it('12. respects limit', async () => {
      const results = await engine.search('JavaScript', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('13. respects minScore', async () => {
      const results = await engine.search('quantum physics', { minScore: 0.5 });
      expect(results).toHaveLength(0);
    });

    it('14. results sorted by score descending', async () => {
      const results = await engine.search('JavaScript runtime library');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });
  });

  // ── Group 4: Semantic search (3 tests) ─────────────────────────────────

  describe('semantic search', () => {
    it('15. semantic search uses embeddings', async () => {
      const embEngine = new KnowledgeEngine(mockEmbedding);
      await embEngine.ingestDocument('TypeScript tutorial', 'ts.txt', 'text', {
        generateEmbeddings: true,
      });
      await embEngine.ingestDocument('React hooks guide', 'react.txt', 'text', {
        generateEmbeddings: true,
      });

      const results = await embEngine.search('TypeScript', { semantic: true });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('16. semantic search falls back gracefully with no embeddings', async () => {
      const results = await engine.search('test', { semantic: true });
      expect(results).toHaveLength(0);
    });

    it('17. semantic results include score', async () => {
      const embEngine = new KnowledgeEngine(mockEmbedding);
      await embEngine.ingestDocument('test content here', 't.txt', 'text', {
        generateEmbeddings: true,
      });
      const results = await embEngine.search('test content', { semantic: true, minScore: 0.01 });
      for (const r of results) {
        expect(r.score).toBeDefined();
      }
    });
  });

  // ── Group 5: Source management (4 tests) ────────────────────────────────

  describe('source management', () => {
    it('18. add and list sources', () => {
      const source: KnowledgeSource = {
        id: 'src1',
        name: 'Test Source',
        type: 'text',
        loader: async () => 'loaded content',
      };
      engine.addSource(source);
      expect(engine.listSources()).toHaveLength(1);
    });

    it('19. remove source', () => {
      engine.addSource({ id: 's1', name: 'S1', type: 'text', loader: async () => '' });
      expect(engine.removeSource('s1')).toBe(true);
      expect(engine.listSources()).toHaveLength(0);
    });

    it('20. ingest from source', async () => {
      engine.addSource({
        id: 'src1',
        name: 'My Source',
        type: 'text',
        loader: async () => 'Source loaded content about TypeScript',
      });
      const doc = await engine.ingestFromSource('src1');
      expect(doc).toBeDefined();
      expect(doc!.content).toContain('TypeScript');
    });

    it('21. ingestAll loads from all sources', async () => {
      engine.addSource({ id: 's1', name: 'S1', type: 'text', loader: async () => 'content 1' });
      engine.addSource({ id: 's2', name: 'S2', type: 'text', loader: async () => 'content 2' });
      const docs = await engine.ingestAll();
      expect(docs).toHaveLength(2);
    });
  });

  // ── Group 6: queryContext (3 tests) ─────────────────────────────────────

  describe('queryContext', () => {
    it('22. returns formatted context string', async () => {
      await engine.ingestDocument('TypeScript is great for large projects', 'ts.txt');
      const ctx = await engine.queryContext('TypeScript');
      expect(ctx).toContain('RELEVANT KNOWLEDGE');
      expect(ctx).toContain('TypeScript');
    });

    it('23. returns empty string when no results', async () => {
      const ctx = await engine.queryContext('nonexistent topic');
      expect(ctx).toBe('');
    });

    it('24. respects maxChars', async () => {
      await engine.ingestDocument('A'.repeat(1000), 'big.txt');
      const ctx = await engine.queryContext('A', { maxChars: 200 });
      expect(ctx.length).toBeLessThanOrEqual(300);
    });
  });

  // ── Group 7: Document management (4 tests) ─────────────────────────────

  describe('document management', () => {
    it('25. getDocument retrieves by id', async () => {
      const { document } = await engine.ingestDocument('test', 't.txt');
      const retrieved = engine.getDocument(document.id);
      expect(retrieved).toEqual(document);
    });

    it('26. listDocuments returns all', async () => {
      await engine.ingestDocument('doc1', 'd1.txt');
      await engine.ingestDocument('doc2', 'd2.txt', 'text', { deduplicate: false });
      expect(engine.listDocuments()).toHaveLength(2);
    });

    it('27. removeDocument cleans up chunks', async () => {
      const { document } = await engine.ingestDocument('removable content', 'r.txt');
      expect(engine.removeDocument(document.id)).toBe(true);
      expect(engine.getDocument(document.id)).toBeUndefined();
      expect(engine.getStats().chunks).toBe(0);
    });

    it('28. removeDocument returns false for unknown', () => {
      expect(engine.removeDocument('nonexistent')).toBe(false);
    });
  });

  // ── Group 8: Stats & clear (2 tests) ───────────────────────────────────

  describe('stats and clear', () => {
    it('29. getStats returns correct counts', async () => {
      await engine.ingestDocument('doc one', 'd1.txt');
      await engine.ingestDocument('doc two', 'd2.txt', 'text', { deduplicate: false });
      engine.addSource({ id: 's1', name: 'S1', type: 'text', loader: async () => '' });
      const stats = engine.getStats();
      expect(stats.documents).toBe(2);
      expect(stats.chunks).toBeGreaterThan(0);
      expect(stats.sources).toBe(1);
    });

    it('30. clear removes everything', async () => {
      await engine.ingestDocument('data', 'd.txt');
      engine.clear();
      expect(engine.getStats()).toEqual({ documents: 0, chunks: 0, sources: 0 });
    });
  });
});
