import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadDocument,
  loadDirectory,
  sourceOf,
  extractDocxText,
  redactSecrets,
} from './loaders.js';
import {
  splitFixed,
  splitMarkdown,
  splitCode,
  splitRecursive,
  chunkDocument,
} from './splitters.js';
import { IngestIndexer, createCollectingSink } from './indexer.js';
import {
  HybridRetriever,
  bm25Score,
  reciprocalRankFusion,
  cosineSimilarity,
  parentDocumentRetrieval,
  BM25Index,
} from './retrieval.js';
import { main as cliMain } from './cli.js';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

describe('loaders', () => {
  it('loads text files with stable hashes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingest-load-'));
    writeFileSync(join(dir, 'a.md'), '# Hello\nWorld content');
    const doc = must((await loadDocument(join(dir, 'a.md'))).document);
    expect(doc.source).toBe('markdown');
    expect(doc.hash).toMatch(/^[0-9a-f]{32}$/);
    const again = must((await loadDocument(join(dir, 'a.md'))).document);
    expect(again.hash).toBe(doc.hash);
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips unreadable and empty files', async () => {
    expect((await loadDocument('/nope/x.md')).skipped).toBeDefined();
    const dir = mkdtempSync(join(tmpdir(), 'ingest-empty-'));
    writeFileSync(join(dir, 'empty.txt'), '   ');
    expect((await loadDocument(join(dir, 'empty.txt'))).skipped).toContain('empty');
    rmSync(dir, { recursive: true, force: true });
  });

  it('extracts docx text runs without native deps', () => {
    // Simulated zip containing word/document.xml with <w:t> runs.
    const zip = Buffer.from(
      'PK\u0003\u0004word/document.xml<w:document><w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body></w:document>',
      'latin1',
    );
    expect(extractDocxText(zip)).toContain('Hello World');
  });

  it('loads directories and discovers code files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingest-dir-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;');
    writeFileSync(join(dir, 'src', 'b.md'), 'docs');
    writeFileSync(join(dir, 'notes.txt'), 'notes');
    const { documents } = await loadDirectory(dir);
    expect(documents.map((d) => d.path).sort()).toEqual(['notes.txt', 'src/a.ts', 'src/b.md']);
    expect(sourceOf('x.py')).toBe('code');
    rmSync(dir, { recursive: true, force: true });
  });

  it('redacts secrets (P73 guardrail)', () => {
    const out = redactSecrets('key=sk-1234567890abcdef1234567890abcdef and AKIAABCDEFGHIJ123456');
    expect(out).toContain('[REDACTED:API_KEY]');
    expect(out).toContain('[REDACTED:AWS_KEY]');
    expect(out).not.toContain('sk-1234');
  });
});

describe('splitters', () => {
  it('splitFixed respects size and overlap', () => {
    const parts = splitFixed('a'.repeat(100), { chunkSize: 40, overlap: 10 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 40)).toBe(true);
  });

  it('splitMarkdown keeps heading context', () => {
    const parts = splitMarkdown('# Title\n\npara one\n\n## Sub\n\npara two');
    expect(parts.some((p) => p.startsWith('## Title'))).toBe(true);
  });

  it('splitCode windows lines', () => {
    const parts = splitCode(Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'), {
      chunkSize: 30,
    });
    expect(parts.length).toBeGreaterThan(3);
    expect(parts[0]?.split('\n')).toHaveLength(30);
  });

  it('splitRecursive merges paragraphs up to chunk size', () => {
    const parts = splitRecursive(`${'a'.repeat(100)}\n\n${'b'.repeat(100)}\n\n${'c'.repeat(100)}`, {
      chunkSize: 350,
    });
    expect(parts.length).toBe(1);
  });

  it('chunkDocument routes by source type', () => {
    const chunks = chunkDocument(
      { path: 'a.ts', source: 'code', content: 'x\ny\nz', hash: 'h', bytes: 6 },
      { chunkSize: 2 },
    );
    expect(chunks[0]?.docPath).toBe('a.ts');
    expect(chunks[0]?.tokenEstimate).toBeGreaterThan(0);
  });
});

describe('indexer', () => {
  it('indexes a directory with dedup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingest-idx-'));
    writeFileSync(join(dir, 'a.md'), '# A\ncontent a'.repeat(50));
    writeFileSync(join(dir, 'b.txt'), 'plain b '.repeat(40));
    const { chunks, sink } = createCollectingSink();
    const indexer = new IngestIndexer(sink);
    const stats = await indexer.index(dir);
    expect(stats.docs).toBe(2);
    expect(stats.chunks).toBeGreaterThan(0);
    expect(chunks.length).toBe(stats.chunks);

    // Second run on the same instance: identical hashes → dedup.
    const stats2 = await indexer.index(dir);
    expect(stats2.deduplicated).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('supports abort', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingest-abort-'));
    writeFileSync(join(dir, 'a.md'), 'x'.repeat(100));
    const controller = new AbortController();
    controller.abort();
    const indexer = new IngestIndexer(createCollectingSink().sink, { signal: controller.signal });
    await expect(indexer.index(dir)).rejects.toThrow('aborted');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('retrieval', () => {
  const chunks = [
    { id: 'c1', docPath: 'a.md', index: 0, text: 'the red fox jumps', tokenEstimate: 5 },
    { id: 'c2', docPath: 'a.md', index: 1, text: 'the blue sky is clear', tokenEstimate: 5 },
    { id: 'c3', docPath: 'b.md', index: 0, text: 'foxes and dogs run fast', tokenEstimate: 5 },
  ];

  it('bm25 ranks relevant chunks first', () => {
    const scores = bm25Score('fox jumps', chunks);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(ranked[0]?.[0]).toBe('c1');
  });

  it('fuses rankings with RRF', () => {
    const fused = reciprocalRankFusion([
      new Map([
        ['a', 1],
        ['b', 0.5],
      ]),
      new Map([
        ['b', 1],
        ['c', 0.5],
      ]),
    ]);
    expect(fused.get('b')).toBeGreaterThan(fused.get('a') ?? 0);
  });

  it('hybrid retrieval returns typed results', async () => {
    const vectors = {
      embed: async (text: string) => {
        const vec = new Array(8).fill(0) as number[];
        for (let i = 0; i < text.length; i++) vec[i % 8] = (vec[i % 8] ?? 0) + text.charCodeAt(i);
        return vec;
      },
    };
    const retriever = new HybridRetriever(chunks, vectors, {
      vectorThreshold: 0,
      useNative: false,
    });
    const results = await retriever.retrieve('fox', 2);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.source).toBe('hybrid');
  });

  it('uses the native BM25 leg when the retrieval addon is registered', async () => {
    const { registerNative, unregisterNative } = await import('@ghita/native-bridge');
    class FakeBm25 {
      constructor(public chunks: Array<{ id: number; text: string }>) {}
      query(query: string, topK?: number) {
        const ids: number[] = [];
        const scores: number[] = [];
        this.chunks.forEach((c, i) => {
          if (c.text.includes(query)) {
            ids.push(i);
            scores.push(1);
          }
        });
        if (topK !== undefined) {
          ids.length = Math.min(ids.length, topK);
          scores.length = ids.length;
        }
        return { ids: new Uint32Array(ids), scores: new Float32Array(scores) };
      }
      get size() {
        return this.chunks.length;
      }
    }
    registerNative('retrieval', { Bm25Index: FakeBm25 } as never);
    try {
      const retriever = new HybridRetriever(
        chunks,
        { embed: async () => new Array(4).fill(0) as number[] },
        { useNative: true },
      );
      expect(retriever.usingNative()).toBe(true);
      const results = await retriever.retrieve('fox', 2);
      expect(results.length).toBeGreaterThan(0);
    } finally {
      unregisterNative('retrieval');
    }
  });

  it('cosineSimilarity basics', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('parent document retrieval returns parents', () => {
    const results = parentDocumentRetrieval(
      chunks,
      (c) =>
        c.docPath === 'a.md'
          ? { ...c, id: 'parent-a', index: -1, text: `PARENT ${c.text}` }
          : undefined,
      'fox',
    );
    expect(results[0]?.text.startsWith('PARENT')).toBe(true);
  });
});

describe('cli', () => {
  it('ingests a file and writes reports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingest-cli-'));
    writeFileSync(join(dir, 'a.md'), '# Hello\nworld content '.repeat(20));
    const out = join(dir, 'out');
    const code = await cliMain([join(dir, 'a.md'), '--out', out]);
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
describe('BM25Index (v1.1.0 Track 8 A4)', () => {
  const chunks = [
    {
      id: 'c1',
      docPath: 'a.md',
      index: 0,
      text: 'the red fox jumps over the dog',
      tokenEstimate: 8,
    },
    { id: 'c2', docPath: 'a.md', index: 1, text: 'the blue sky is clear today', tokenEstimate: 6 },
    {
      id: 'c3',
      docPath: 'b.md',
      index: 0,
      text: 'foxes and dogs run fast in the park',
      tokenEstimate: 8,
    },
  ];

  it('precomputes DF and ranks relevant chunks first', () => {
    const index = new BM25Index(chunks);
    expect(index.size()).toBeGreaterThan(0);
    const results = index.query('fox jumps', 2);
    expect(results[0]?.chunkId).toBe('c1');
    expect(results[0]?.source).toBe('bm25');
  });

  it('query equals the naive bm25Score ranking for the top hit', () => {
    const index = new BM25Index(chunks);
    const naive = bm25Score('fox', chunks);
    const topNaive = [...naive.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(index.query('fox', 1)[0]?.chunkId).toBe(topNaive);
  });
});
