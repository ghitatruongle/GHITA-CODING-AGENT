#!/usr/bin/env node

// Three probes on the identified hot paths:
//   [A] security line-regex over 5MB generated code
//   [B] BM25 retrieval over 10k chunks
//   [C] PageRank over 20k nodes x 30 iterations
// Usage:
//   node scripts/bench-cpu.mjs              # run, print results
//   node scripts/bench-cpu.mjs --json       # JSON (for CI/baseline)
//   node scripts/bench-cpu.mjs --baseline   # compare with docs/perf-baseline.json

import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(root, 'docs', 'perf-baseline.json');
const REGRESSION_THRESHOLD = 0.1; // 10%

const RULES = [
  /sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{20,}/,
  /(password|passwd|pwd|secret|token|api_key|apikey)\s*[:=]\s*["'][^"']{8,}["']/i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/,
  /(aws_access_key_id|aws_secret_access_key)/,
  /(mongodb|postgres|mysql|redis):\/\/[^\s"']+/,
  /(curl|wget)\s+[^\s|;]+(\||;)\s*(sh|bash)/i,
  /(eval|exec|spawn|child_process)\s*\(/i,
  /\.innerHTML\s*=/, /document\.write\s*\(/i,
  /(SELECT|INSERT|UPDATE|DELETE)\s+.*\bFROM\b/i,
  /<script\b[^>]*>/i,
  /\.env\s*$/, /(chmod|chown)\s+[-0-9]+/, /sudo\s+rm\s+-rf/i,
];

export function genCode(mb) {
  const lines = [];
  const filler = 'const x = compute(values, index, config); // normal code line\n';
  const target = mb * 1024 * 1024;
  let size = 0;
  let i = 0;
  while (size < target) {
    if (i % 500 === 0) lines.push(`const apiKey = "sk-${'a'.repeat(28)}"; // ${i}\n`);
    else if (i % 700 === 0) lines.push(`password = 'super-secret-value-${i}'\n`);
    else lines.push(filler);
    size += lines[lines.length - 1].length;
    i++;
  }
  return lines.join('');
}

export function benchScannerScan(code) {
  const t0 = performance.now();
  let findings = 0;
  for (const line of code.split('\n')) {
    for (const re of RULES) {
      if (re.test(line)) { findings++; break; }
    }
  }
  return { ms: performance.now() - t0, findings };
}

export function benchScannerStream(code, blockSize = 1024 * 1024) {
  const t0 = performance.now();
  let findings = 0;
  let buffer = '';
  let start = 0;
  while (start < code.length) {
    buffer += code.slice(start, start + blockSize);
    // Split at the last newline so lines never break across blocks.
    const lastNl = buffer.lastIndexOf('\n');
    const chunk = lastNl === -1 ? buffer : buffer.slice(0, lastNl + 1);
    for (const line of chunk.split('\n')) {
      for (const re of RULES) {
        if (re.test(line)) { findings++; break; }
      }
    }
    buffer = lastNl === -1 ? '' : buffer.slice(lastNl + 1);
    start += blockSize;
  }
  if (buffer) {
    for (const line of buffer.split('\n')) {
      for (const re of RULES) {
        if (re.test(line)) { findings++; break; }
      }
    }
  }
  return { ms: performance.now() - t0, findings };
}

/** Fast path: single alternation regex, no line split (whole buffer, /gm). */
export function benchScannerFast(code) {
  const combined = new RegExp(
    `(?:${RULES.map((r) => r.source).join('|')})`,
    'gm',
  );
  const t0 = performance.now();
  const matches = code.match(combined) ?? [];
  return { ms: performance.now() - t0, findings: matches.length };
}

export function bm25InvertedIndex(chunks, k1 = 1.5, b = 0.75) {
  // Build inverted index once: token -> { df, postings: [{chunkIdx, tf}] }
  const index = new Map();
  const avgLen = chunks.reduce((s, c) => s + c.text.length, 0) / Math.max(1, chunks.length);
  for (let ci = 0; ci < chunks.length; ci++) {
    const text = chunks[ci].text.toLowerCase();
    const seen = new Set();
    for (const token of text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
      if (seen.has(token)) continue;
      seen.add(token);
      let entry = index.get(token);
      if (!entry) { entry = { df: 0, postings: [] }; index.set(token, entry); }
      entry.df++;
      const freq = countOccurrences(text, token);
      entry.postings.push({ ci, tf: freq });
    }
  }
  return { index, avgLen, chunks };
}

export function bm25Query(query, built, k1 = 1.5, b = 0.75) {
  const { index, avgLen, chunks } = built;
  const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const scores = new Map();
  const N = chunks.length;
  for (const term of terms) {
    const entry = index.get(term);
    if (!entry) continue;
    const idf = Math.log(1 + (N - entry.df + 0.5) / (entry.df + 0.5));
    for (const { ci, tf } of entry.postings) {
      const len = chunks[ci].text.length;
      const tfn = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (len / avgLen)));
      scores.set(ci, (scores.get(ci) ?? 0) + idf * tfn);
    }
  }
  return scores;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

export function makeChunks(n) {
  const chunks = [];
  for (let i = 0; i < n; i++) {
    chunks.push({ id: `c${i}`, text: `document chunk ${i} about ${i % 7 === 0 ? 'networking protocol tcp' : 'generic content data'} with some words ${'filler '.repeat(60)}` });
  }
  return chunks;
}

export function pagerankTyped(nodes, edges, damping = 0.85, iterations = 30) {
  const N = nodes;
  // CSR: flat from/to arrays (no per-edge tuple allocation).
  const from = new Uint32Array(edges.length);
  const to = new Uint32Array(edges.length);
  const outCount = new Float64Array(N);
  for (let i = 0; i < edges.length; i++) {
    from[i] = edges[i][0];
    to[i] = edges[i][1];
    outCount[edges[i][1]]++;
  }
  const rank = new Float64Array(N).fill(1 / N);
  const next = new Float64Array(N);
  const t0 = performance.now();
  for (let it = 0; it < iterations; it++) {
    next.fill((1 - damping) / N);
    for (let i = 0; i < from.length; i++) {
      next[to[i]] += damping * (rank[from[i]] / (outCount[from[i]] || 1));
    }
    rank.set(next);
  }
  return { ms: performance.now() - t0 };
}

export function makeEdges(n) {
  const edges = [];
  for (let i = 1; i < n; i++) edges.push([i, i - 1], [i, Math.floor(i / 2)]);
  return edges;
}

/** Small but realistic TS sample — ~20 symbols per file. */
export function genTsSample() {
  return [
    "import { useState, useEffect } from 'react';",
    "import fs from 'node:fs';",
    '',
    '/** Sample module for AST parsing benchmarks */',
    'export function compute(a: number, b: number): number {',
    '  return a + b;',
    '}',
    '',
    'export interface Config {',
    '  enabled: boolean;',
    '  retries: number;',
    '}',
    '',
    'export class Worker {',
    '  private results: number[] = [];',
    '  constructor(private readonly name: string) {}',
    '  run(input: Config): number {',
    '    for (let i = 0; i < input.retries; i++) {',
    '      this.results.push(compute(i, 1));',
    '    }',
    '    return this.results.length;',
    '  }',
    '}',
    '',
    'const cache = new Map<string, number>();',
    'export const helper = (x: number) => x * 2;',
    'export default Worker;',
  ].join('\n');
}

/**
 * Ensure a shared TS corpus exists on disk (used by both the JS (bench-cpu)
 * and native (bench-native) AST probes so they parse identical inputs).
 * Returns the file paths.
 */
export function ensureTsCorpus(dir, count) {
  mkdirSync(dir, { recursive: true });
  const content = genTsSample();
  const paths = [];
  for (let i = 0; i < count; i++) {
    const p = join(dir, `f${i}.ts`);
    if (!existsSync(p)) writeFileSync(p, content);
    paths.push(p);
  }
  return paths;
}

/** JS lineDiffStat (same algorithm as apps/desktop/src/utils/editProposal.ts). */
export function lineDiffStatJS(original, proposed) {
  if (original === proposed) return { added: 0, removed: 0, unchanged: true };
  const a = original.split('\n');
  const b = proposed.split('\n');
  const m = b.length;
  let prev = new Array(m + 1).fill(0);
  let curr = new Array(m + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= m; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  const lcs = prev[m] ?? 0;
  return { added: b.length - lcs, removed: a.length - lcs, unchanged: false };
}

/** [E] Diff-stat over two ~5k-line texts with a small edit (UI burst case). */
export function benchDiffStat(lines = 5000) {
  const a = Array.from({ length: lines }, (_, i) => `line ${i} = value ${i};`);
  const b = a.slice();
  b[Math.floor(lines / 2)] = `line ${Math.floor(lines / 2)} = EDITED;`;
  const original = a.join('\n');
  const proposed = b.join('\n');
  const t0 = performance.now();
  const stat = lineDiffStatJS(original, proposed);
  return { ms: performance.now() - t0, added: stat.added, removed: stat.removed };
}

export async function runAll() {
  const code = genCode(5);
  const chunks = makeChunks(10000);
  const edges = makeEdges(20000);

  const scanNaive = benchScannerScan(code);
  const scanStream = benchScannerStream(code);

  // Optimized probes: min of 3 runs (JIT noise on sub-10ms measurements).
  let scanFast = Infinity;
  let bm25Ms = Infinity;
  let prMs = Infinity;
  for (let run = 0; run < 3; run++) {
    scanFast = Math.min(scanFast, benchScannerFast(code).ms);
    const built = bm25InvertedIndex(chunks);
    const t0 = performance.now();
    bm25Query('networking protocol', built);
    bm25Ms = Math.min(bm25Ms, performance.now() - t0);
    prMs = Math.min(prMs, pagerankTyped(20000, edges).ms);
  }

  // [D] AST parse (JS — TS Compiler API) over 1000 files, [E] diff-stat 5k lines.
  const corpusDir = join(root, '.bench-tmp', 'corpus');
  const corpus = ensureTsCorpus(corpusDir, 1000);
  const { parseFiles } = await import('../packages/code-graph/dist/ast-parser.js');
  const astT0 = performance.now();
  const astResult = parseFiles(corpus, { forceJs: true });
  const astMs = performance.now() - astT0;
  const diffProbe = benchDiffStat(5000);

  return {
    'scanner.naive.ms': scanNaive.ms,
    'scanner.stream.ms': scanStream.ms,
    'scanner.fast.ms': scanFast,
    'scanner.findings': scanNaive.findings,
    'bm25.index+query.ms': bm25Ms,
    'bm25.chunks': chunks.length,
    'pagerank.typed.ms': prMs,
    'pagerank.nodes': 20000,
    'ast-parse.js.ms': astMs,
    'ast-parse.files': corpus.length,
    'ast-parse.nodes': astResult.nodes.length,
    'diffstat.js.ms': diffProbe.ms,
    'diffstat.lines': 5000,
  };
}

export function fmtResults(results) {
  return [
    `[A] scanner naive   : ${results['scanner.naive.ms'].toFixed(1)} ms (findings ${results['scanner.findings']})`,
    `[A] scanner stream  : ${results['scanner.stream.ms'].toFixed(1)} ms`,
    `[A] scanner fast    : ${results['scanner.fast.ms'].toFixed(1)} ms`,
    `[B] bm25 (10k chunks): ${results['bm25.index+query.ms'].toFixed(1)} ms`,
    `[C] pagerank typed  : ${results['pagerank.typed.ms'].toFixed(1)} ms`,
    `[D] ast-parse JS (${results['ast-parse.files']} files): ${results['ast-parse.js.ms'].toFixed(1)} ms (${results['ast-parse.nodes']} nodes)`,
    `[E] diff-stat JS (5k lines): ${results['diffstat.js.ms'].toFixed(1)} ms`,
  ].join('\n');
}

export function checkBaseline(results) {
  if (!existsSync(BASELINE_PATH)) return { ok: true, note: 'no baseline yet' };
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  const failures = [];
  for (const [key, value] of Object.entries(baseline)) {
    if (typeof value !== 'number') continue;
    if (results[key] === undefined) continue;
    // scanner.naive.ms is the "before" reference — not a regression target.
    if (key.endsWith('.naive.ms')) continue;
    
    const absolute = results[key] - value;
    if (results[key] > value * (1 + REGRESSION_THRESHOLD) && absolute > 0.5) {
      failures.push(`${key}: ${results[key].toFixed(1)} > baseline ${value.toFixed(1)} (+${((results[key] / value - 1) * 100).toFixed(0)}%)`);
    }
  }
  return failures.length === 0
    ? { ok: true, note: 'within 10% of baseline' }
    : { ok: false, note: failures.join('; ') };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const json = process.argv.includes('--json');
  const baselineCheck = process.argv.includes('--baseline');
  const results = await runAll();
  if (json) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    process.stdout.write(fmtResults(results) + '\n');
    if (baselineCheck) {
      const check = checkBaseline(results);
      process.stdout.write(`[gate] ${check.note}\n`);
      if (!check.ok) process.exitCode = 1;
    }
  }
}
