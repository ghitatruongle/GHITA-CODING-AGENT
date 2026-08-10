import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../index.js';
import { createDocumentIngestSkill } from './document-ingest.js';
import { createKnowledgeEngineSink, IngestIndexer } from '@ghita/ingest';
import type { KnowledgeEngineLike } from '@ghita/ingest';

/** Structural fake of the memory KnowledgeEngine (real engine covered in @ghita/ingest). */
function fakeEngine() {
  const docs = new Set<string>();
  let calls = 0;
  const engine: KnowledgeEngineLike = {
    ingestDocument: async (content, source) => {
      calls += 1;
      docs.add(source);
      return { ok: true };
    },
    getStats: () => ({ documents: docs.size, chunks: calls * 2, sources: 0 }),
  };
  return { engine, docs, calls: () => calls };
}

describe('document.ingest skill (P68)', () => {
  it('ingests a directory and reports stats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-ingest-'));
    writeFileSync(join(dir, 'a.md'), '# A\ncontent '.repeat(30));
    writeFileSync(join(dir, 'b.txt'), 'plain '.repeat(30));

    const skill = createDocumentIngestSkill();
    const registry = new SkillRegistry();
    registry.register(skill);

    const result = await registry.run('document.ingest', { input: { path: dir } });
    expect(result.success).toBe(true);
    expect(result.output).toContain('2 document(s)');
    expect(result.output).toContain('chunk(s)');
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails cleanly without a path', async () => {
    const skill = createDocumentIngestSkill();
    const result = await skill.run({ input: {} }, { registry: null, adapters: {}, now: Date.now });
    expect(result.success).toBe(false);
    expect(result.error).toContain('path');
  });

  it('upserts into the engine sink when wired', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-ingest-ke-'));
    writeFileSync(join(dir, 'doc.md'), '# Doc\nknowledge content '.repeat(40));

    const { engine, docs } = fakeEngine();
    const skill = createDocumentIngestSkill({ sink: createKnowledgeEngineSink(engine) });
    const result = await skill.run(
      { input: { path: dir } },
      { registry: null, adapters: {}, now: Date.now },
    );

    expect(result.success).toBe(true);
    expect(docs.size).toBe(1);
    expect(engine.getStats?.().documents).toBe(1);
    expect(engine.getStats?.().chunks).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('engine sink dedups on re-index (incremental upsert)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-ingest-idx-'));
    writeFileSync(join(dir, 'x.md'), 'x '.repeat(60));

    const { engine, docs } = fakeEngine();
    const indexer = new IngestIndexer(createKnowledgeEngineSink(engine));
    await indexer.index(dir);
    expect(docs.size).toBe(1);

    // Second run through a fresh indexer: content-hash dedup keeps 1 doc.
    const indexer2 = new IngestIndexer(createKnowledgeEngineSink(engine));
    await indexer2.index(dir);
    expect(docs.size).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
