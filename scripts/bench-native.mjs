#!/usr/bin/env node

// Measures the compiled napi addons (secscan / retrieval / codegraph) against
// the JS baseline in docs/perf-baseline.json. Skips addons that are not built.
// Usage: node scripts/bench-native.mjs [--json]

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNative } from '../packages/native-bridge/dist/index.js';
import { genCode, makeChunks, makeEdges, ensureTsCorpus } from './bench-cpu.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = JSON.parse(readFileSync(join(root, 'docs', 'perf-baseline.json'), 'utf-8'));

const RULES = [
  { id: 'sk', pattern: 'sk-(?:proj-|org-|ant-)?[A-Za-z0-9_-]{20,}', negative: 'example' },
  { id: 'aws', pattern: 'AKIA[0-9A-Z]{16}', negative: undefined },
  { id: 'ghp', pattern: 'ghp_[A-Za-z0-9]{20,}', negative: undefined },
  { id: 'pkey', pattern: 'BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY', negative: undefined },
  { id: 'cred', pattern: '(?:password|secret|token|api_key)\\s*[:=]\\s*["\'"][^"\'"]{8,}["\'"]', negative: undefined },
];

export async function runNative() {
  const results = {};

  const secscan = loadNative('secscan', {});
  if (secscan.native && typeof secscan.impl.scanFast === 'function') {
    const code = genCode(5);
    const t0 = performance.now();
    const res = secscan.impl.scanFast(code, RULES);
    results['scanner.native.ms'] = performance.now() - t0;
    results['scanner.native.findings'] = res.lines.length;
  }

  const retrieval = loadNative('retrieval', {});
  if (retrieval.native && typeof retrieval.impl.Bm25Index === 'function') {
    const chunks = makeChunks(10000).map((c, i) => ({ id: i, text: c.text }));
    let buildMs = Infinity;
    let queryMs = Infinity;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      const idx = new retrieval.impl.Bm25Index(chunks, 1.5, 0.75);
      buildMs = Math.min(buildMs, performance.now() - t0);
      const t1 = performance.now();
      idx.query('networking protocol', 5);
      queryMs = Math.min(queryMs, performance.now() - t1);
    }
    results['bm25.native.build.ms'] = buildMs;
    results['bm25.native.query.ms'] = queryMs;
  }

  const codegraph = loadNative('codegraph', {});
  if (codegraph.native && typeof codegraph.impl.pagerank === 'function') {
    const edges = makeEdges(20000);
    const from = new Uint32Array(edges.length);
    const to = new Uint32Array(edges.length);
    for (let i = 0; i < edges.length; i++) {
      from[i] = edges[i][0];
      to[i] = edges[i][1];
    }
    let prMs = Infinity;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      codegraph.impl.pagerank(20000, from, to, new Float32Array(edges.length).fill(1), 0.85, 30);
      prMs = Math.min(prMs, performance.now() - t0);
    }
    results['pagerank.native.ms'] = prMs;
  }

  // [D] AST parse native (tree-sitter + rayon) — same 1000-file corpus as the
  // JS probe in bench-cpu.mjs, plus a 10k-file run for the <5s target.
  if (codegraph.native && typeof codegraph.impl.parseFiles === 'function') {
    const corpusDir = join(root, '.bench-tmp', 'corpus');
    const corpus = ensureTsCorpus(corpusDir, 1000);
    const specs = corpus.map((fp) => ({ filePath: fp, content: readFileSync(fp, 'utf-8') }));
    let astMs = Infinity;
    let astNodes = 0;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      const out = codegraph.impl.parseFiles(specs);
      astMs = Math.min(astMs, performance.now() - t0);
      astNodes = out.reduce((a, f) => a + f.symbols.length, 0);
    }
    results['ast-parse.native.ms'] = astMs;
    results['ast-parse.native.nodes'] = astNodes;
    results['ast-parse.native.files'] = specs.length;

    // 10k-file target probe (single run).
    const bigCorpus = ensureTsCorpus(corpusDir, 10000);
    const bigSpecs = bigCorpus.map((fp) => ({
      filePath: fp,
      content: readFileSync(fp, 'utf-8'),
    }));
    const tBig = performance.now();
    codegraph.impl.parseFiles(bigSpecs);
    results['ast-parse.native.10k.ms'] = performance.now() - tBig;
  }

  return results;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const results = await runNative();
  const json = process.argv.includes('--json');
  if (json) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    const lines = [];
    if (results['scanner.native.ms'] !== undefined) {
      lines.push(`[A] scanner native: ${results['scanner.native.ms'].toFixed(1)} ms (JS baseline ${BASELINE['scanner.fast.ms'].toFixed(1)} ms) — ${(BASELINE['scanner.fast.ms'] / results['scanner.native.ms']).toFixed(1)}x`);
    }
    if (results['bm25.native.query.ms'] !== undefined) {
      lines.push(`[B] bm25 native: build ${results['bm25.native.build.ms'].toFixed(1)} ms · query ${results['bm25.native.query.ms'].toFixed(3)} ms (JS query baseline ${BASELINE['bm25.index+query.ms'].toFixed(1)} ms)`);
    }
    if (results['pagerank.native.ms'] !== undefined) {
      lines.push(`[C] pagerank native: ${results['pagerank.native.ms'].toFixed(1)} ms (JS baseline ${BASELINE['pagerank.typed.ms'].toFixed(1)} ms) — ${(BASELINE['pagerank.typed.ms'] / results['pagerank.native.ms']).toFixed(1)}x`);
    }
    if (results['ast-parse.native.ms'] !== undefined) {
      const jsBase = BASELINE['ast-parse.js.ms'];
      const ratio = jsBase ? (jsBase / results['ast-parse.native.ms']).toFixed(1) : 'n/a';
      lines.push(`[D] ast-parse native: ${results['ast-parse.native.ms'].toFixed(1)} ms / ${results['ast-parse.native.files']} files (JS baseline ${jsBase ? jsBase.toFixed(1) : 'n/a'} ms) — ${ratio}x · 10k files: ${results['ast-parse.native.10k.ms'].toFixed(1)} ms`);
    }
    if (lines.length === 0) lines.push('No native addons built — run `napi build` for secscan/retrieval/codegraph first.');
    process.stdout.write(lines.join('\n') + '\n');
  }
}
