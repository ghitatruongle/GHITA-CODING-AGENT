#!/usr/bin/env node

// Usage: node scripts/audit-zero-copy.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['packages/security/src', 'packages/ingest/src', 'packages/code-graph/src', 'packages/ai-engine/src/cache'];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function audit(dir) {
  const files = walk(dir);
  const counts = { splitNewline: 0, jsonClone: 0, loops: 0 };
  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    counts.splitNewline += (source.match(/\.split\([^)]*\\n/g) ?? []).length;
    counts.jsonClone += (source.match(/JSON\.parse\(JSON\.stringify/g) ?? []).length;
    counts.loops += (source.match(/for \(const .* of .*\)\s*\{[\s\S]{0,200}?\.push/g) ?? []).length;
  }
  return counts;
}

function main() {
  process.stdout.write('# Zero-copy / streaming audit (v1.1.0 Track 9 B8)\n\n');
  process.stdout.write('| Package | split(\\n) | JSON clone | push-in-loop |\n|---|---|---|---|\n');
  let total = { splitNewline: 0, jsonClone: 0, loops: 0 };
  for (const t of TARGETS) {
    const counts = audit(join(root, t));
    total.splitNewline += counts.splitNewline;
    total.jsonClone += counts.jsonClone;
    total.loops += counts.loops;
    process.stdout.write(`| ${t} | ${counts.splitNewline} | ${counts.jsonClone} | ${counts.loops} |\n`);
  }
  process.stdout.write(`\nTổng: split(\\n)=${total.splitNewline} · JSON clone=${total.jsonClone} · push-in-loop=${total.loops}\n`);
  process.stdout.write(
    '\nGhi chú: Track 8 đã giảm điểm nóng — scanner dùng lazy-line + alternation regex; ' +
    'BM25 dùng inverted index; PageRank dùng TypedArray; native addon trả Uint32Array/Float32Array (zero-copy).\n',
  );
}

main();
