// v1.2.0-demo1 P2.1 micro-bench: rank JS hot spots in memory compact,
// ingest splitters, and diff-stat before choosing optimization targets.
// Run: pnpm tsx examples/bench-demo1.mjs

import { performance } from 'node:perf_hooks';
import { MemoryCompactor } from '../packages/memory/src/semantic/compact.js';
import { splitCode, splitRecursive } from '../packages/ingest/src/splitters.js';
import { lineDiffStat } from '../apps/desktop/src/utils/editProposal.js';

const results: Record<string, number> = {};

function time(label: string, fn: () => unknown, reps = 3): void {
  let best = Infinity;
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  results[label] = +best.toFixed(1);
  console.log(`${label}: ${best.toFixed(1)} ms`);
}

// ── memory: scoreAll + deduplicate on 1000 entries ─────────────────────
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon'.split(' ');
const entries = Array.from({ length: 1000 }, (_, i) => ({
  id: `e${i}`,
  content: Array.from({ length: 40 }, (_, j) => WORDS[(i * 7 + j * 13) % WORDS.length]).join(' '),
  timestamp: Date.now() - i * 60_000,
  relevance: (i % 10) / 10,
}));
const compact = new MemoryCompactor({});
time('memory.scoreAll.1k', () => compact.scoreAll(entries, Date.now()));
time('memory.dedup.1k', () => compact.deduplicate(entries));

// ── ingest: splitCode / splitRecursive on ~160k chars ──────────────────
const codeLines = Array.from({ length: 8000 }, (_, i) => `${i}: const x${i} = compute(a, b) + ${(i * 31) % 97};`);
const codeText = codeLines.join('\n');
time('ingest.splitCode.8k-lines', () => splitCode(codeText, { chunkSize: 300 }));
const paras = Array.from({ length: 2000 }, (_, i) => `Paragraph ${i}: ${'lorem ipsum dolor sit amet '.repeat(4)}`);
const paraText = paras.join('\n\n');
time('ingest.splitRecursive.2k-paras', () => splitRecursive(paraText, { chunkSize: 1200 }));

// ── diff-stat: realistic AI edit (5k lines, ~1% changed) + worst case ──
const base = Array.from({ length: 5000 }, (_, i) => `line ${i} content ${i % 997}`).join('\n');
const edited = base
  .split('\n')
  .map((l, i) => (i % 100 === 50 ? `${l} // touched` : l))
  .join('\n');
time('diffstat.realistic.5k', () => lineDiffStat(base, edited));
const shuffled = base.split('\n').reverse().join('\n');
time('diffstat.worst.5k', () => lineDiffStat(base, shuffled));

console.log('\nJSON:', JSON.stringify(results));
