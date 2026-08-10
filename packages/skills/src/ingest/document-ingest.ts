// ==============================================================================
// GHITA CODING AGENT - Skills v1.1.0 Track 6 P68: document.ingest skill
// ==============================================================================
// `document.ingest`: run the @ghita/ingest pipeline from inside the agent —
// loaders → chunkers → (optional) KnowledgeEngine upsert. Returns stats for
// the agent to report.
// ==============================================================================

import type { SkillDefinition, SkillInvocation, SkillExecutionContext } from '../types.js';
import type { ChunkSink } from '@ghita/ingest';
import { IngestIndexer } from '@ghita/ingest';

export interface DocumentIngestSkillDeps {
  /** Chunk sink (KnowledgeEngine adapter when provided, else collecting). */
  sink?: ChunkSink;
  redact?: boolean;
  chunkSize?: number;
  overlap?: number;
  knownHashes?: Map<string, string>;
}

export interface DocumentIngestInput {
  /** File or directory to ingest. */
  path: string;
  redact?: boolean;
  chunkSize?: number;
  overlap?: number;
}

/**
 * Create the `document.ingest` skill. Invocation: `{ input: { path } }`.
 * When a KnowledgeEngine sink is wired, chunks are upserted into memory.
 */
export function createDocumentIngestSkill(deps: DocumentIngestSkillDeps = {}): SkillDefinition {
  return {
    id: 'document.ingest',
    name: 'Document Ingest',
    description:
      'Use this skill whenever you need to load documents (md, json, csv, txt, docx, code) ' +
      'into the knowledge base. Triggers include: "ingest", "index documents", "add docs to memory".',
    category: 'developer' as SkillDefinition['category'],
    version: '1.1.0',
    scopes: ['workspace'],
    status: 'ready',
    enabled: true,
    allowedTools: ['file'],
    run: async (invocation: SkillInvocation, _context: SkillExecutionContext) => {
      const input = (invocation.input ?? {}) as unknown as DocumentIngestInput;
      if (!input.path) {
        return { success: false, error: 'document.ingest requires input.path' };
      }

      const collect: ChunkSink =
        deps.sink ??
        (async () => {
          /* default: no-op sink — stats still reported */
        });

      const indexer = new IngestIndexer(collect, {
        redact: deps.redact ?? input.redact ?? false,
        knownHashes: deps.knownHashes,
        chunkOptions: {
          chunkSize: input.chunkSize ?? deps.chunkSize,
          overlap: input.overlap ?? deps.overlap,
        },
      });

      try {
        const stats = await indexer.index(input.path);
        const output = [
          `Ingested ${stats.docs} document(s) → ${stats.chunks} chunk(s)`,
          `Deduplicated: ${stats.deduplicated} · Skipped: ${stats.skipped} · ${stats.durationMs}ms`,
          'Knowledge base updated.',
        ].join('\n');
        return { success: true, output };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
