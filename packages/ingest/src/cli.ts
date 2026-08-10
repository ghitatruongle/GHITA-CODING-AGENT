#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - @ghita/ingest CLI (P68): `ghita ingest <path>`
// ==============================================================================

import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { IngestIndexer, createCollectingSink } from './indexer.js';

const HELP = `
Usage:
  ghita-ingest <path> [--out <dir>] [--redact] [--chunk-size <n>] [--overlap <n>]

Examples:
  ghita-ingest ./docs
  ghita-ingest ./README.md --redact
`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      redact: { type: 'boolean' },
      'chunk-size': { type: 'string' },
      overlap: { type: 'string' },
    },
  });

  const target = positionals[0];
  if (!target || target === '--help' || target === '-h') {
    process.stdout.write(HELP);
    return 0;
  }

  const { chunks, sink } = createCollectingSink();
  const indexer = new IngestIndexer(sink, {
    redact: Boolean(values.redact),
    chunkOptions: {
      chunkSize: values['chunk-size'] ? Number(values['chunk-size']) : undefined,
      overlap: values.overlap ? Number(values.overlap) : undefined,
    },
    onProgress: (p) => {
      if (p.phase === 'load' || p.phase === 'done') {
        process.stdout.write(
          `[ingest] ${p.phase} ${p.processed}/${p.total}${p.current ? ` — ${p.current}` : ''}\n`,
        );
      }
    },
  });

  const stats = await indexer.index(resolve(target));
  const outDir = resolve(values.out ?? '.ghita/ingest');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'chunks.json'), JSON.stringify(chunks, null, 2));
  writeFileSync(join(outDir, 'stats.json'), JSON.stringify(stats, null, 2));

  process.stdout.write(
    `[ingest] done: ${stats.docs} docs → ${stats.chunks} chunks (dedup ${stats.deduplicated}, skipped ${stats.skipped}, ${stats.durationMs}ms)\n`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    });
}
