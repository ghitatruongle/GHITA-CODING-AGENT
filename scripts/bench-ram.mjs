#!/usr/bin/env node

//   [C] chat history 200 messages (ChatHistoryBudget)

// Usage: node scripts/bench-ram.mjs [--json] [--baseline]

import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genCode, makeChunks } from './bench-cpu.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(root, 'docs', 'perf-ram-baseline.json');
const THRESHOLD = 0.1;

function heapDelta(before) {
  return (process.memoryUsage().heapUsed - before) / 1024 / 1024;
}

function scenario(name, work) {
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  work();
  return {
    name,
    heapDeltaMb: Number(heapDelta(before).toFixed(2)),
    ms: Number((performance.now() - t0).toFixed(1)),
  };
}

export function runAll() {
  const results = {};

  const code = genCode(5);
  const a = scenario('scanner-5mb', () => {
    const combined = new RegExp('(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|PRIVATE KEY|password\\s*[:=])', 'gm');
    code.match(combined);
  });
  results['ram.scanner.heapMb'] = a.heapDeltaMb;

  // [B] BM25 10k chunks (inverted index)
  const chunks = makeChunks(10000).map((c) => ({ id: c.id, text: c.text }));
  const b = scenario('bm25-10k', () => {
    const index = new Map();
    for (const c of chunks) {
      for (const token of c.text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
        let e = index.get(token);
        if (!e) { e = { df: 0, postings: [] }; index.set(token, e); }
        e.df++;
        e.postings.push(c.id);
      }
    }
    index.get('networking');
  });
  results['ram.bm25.heapMb'] = b.heapDeltaMb;

  // [C] chat history 200 messages
  const c = scenario('chat-200', () => {
    const messages = [];
    for (let i = 0; i < 200; i++) messages.push({ role: i % 2 ? 'assistant' : 'user', content: `message ${i} ${'x'.repeat(120)}` });
  });
  results['ram.chat200.heapMb'] = c.heapDeltaMb;

  // [D] terminal scrollback 10k lines
  const d = scenario('terminal-10k', () => {
    const lines = [];
    for (let i = 0; i < 10000; i++) lines.push(`line ${i} ${'y'.repeat(60)}`);
  });
  results['ram.terminal10k.heapMb'] = d.heapDeltaMb;

  const peak = process.memoryUsage();
  results['ram.peakRssMb'] = Number((peak.rss / 1024 / 1024).toFixed(1));
  return results;
}

export function checkBaseline(results) {
  if (!existsSync(BASELINE_PATH)) return { ok: true, note: 'no baseline yet' };
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  const failures = [];
  for (const [key, value] of Object.entries(baseline)) {
    if (results[key] === undefined) continue;
    const absolute = results[key] - value;
    if (results[key] > value * (1 + THRESHOLD) && absolute > 2) {
      failures.push(`${key}: ${results[key]} > baseline ${value} (+${((results[key] / value - 1) * 100).toFixed(0)}%)`);
    }
  }
  return failures.length === 0
    ? { ok: true, note: 'within 10% of baseline (abs > 2MB)' }
    : { ok: false, note: failures.join('; ') };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const results = runAll();
  const json = process.argv.includes('--json');
  if (json) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    for (const [k, v] of Object.entries(results)) process.stdout.write(`${k}: ${v}\n`);
    if (process.argv.includes('--baseline')) {
      const check = checkBaseline(results);
      process.stdout.write(`[gate] ${check.note}\n`);
      if (!check.ok) process.exitCode = 1;
    }
  }
}
