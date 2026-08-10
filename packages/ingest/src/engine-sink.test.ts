import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeEngine } from '@ghita/memory';
import { IngestIndexer } from './indexer.js';
import { createKnowledgeEngineSink } from './engine-sink.js';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

describe('createKnowledgeEngineSink (ingest → memory)', () => {
  it('upserts ingested docs into KnowledgeEngine with stats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ke-sink-'));
    writeFileSync(join(dir, 'a.md'), '# Alpha\n\ncontent about alpha '.repeat(30));
    writeFileSync(join(dir, 'b.ts'), 'export const beta = 1;\n'.repeat(40));

    const engine = new KnowledgeEngine();
    const sink = createKnowledgeEngineSink(engine, { chunkSize: 400, chunkOverlap: 40 });
    const indexer = new IngestIndexer(sink);
    const stats = await indexer.index(dir);

    expect(stats.docs).toBe(2);
    expect(stats.chunks).toBeGreaterThan(0);
    const engineStats = engine.getStats();
    expect(engineStats.documents).toBe(2);
    expect(engineStats.chunks).toBeGreaterThan(0);

    // Incremental: re-index with the same indexer → dedup, no new docs.
    const stats2 = await indexer.index(dir);
    expect(stats2.deduplicated).toBe(2);
    expect(engine.getStats().documents).toBe(2);

    rmSync(dir, { recursive: true, force: true });
  });

  it('carries metadata (sourceType, hash) into the engine', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ke-meta-'));
    writeFileSync(join(dir, 'c.md'), '# Meta\ncontent here');
    const engine = new KnowledgeEngine();
    const sink = createKnowledgeEngineSink(engine);
    const indexer = new IngestIndexer(sink);
    await indexer.index(join(dir, 'c.md'));

    const doc = must(engine.listDocuments()[0]);
    expect(doc.source.endsWith('c.md')).toBe(true); // single-file ingest keeps absolute path
    expect(doc.type).toBe('file');
    expect(doc.metadata?.sourceType).toBe('markdown');
    expect(doc.metadata?.hash).toMatch(/^[0-9a-f]{32}$/);
    rmSync(dir, { recursive: true, force: true });
  });
});
