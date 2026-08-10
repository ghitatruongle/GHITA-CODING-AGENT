#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - Lazy-load audit (v1.1.0 Track 9 B6)
// ------------------------------------------------------------------------------
// Rà sidecar server.mjs: đếm static imports của các module nặng và số điểm
// lazy-load (dynamic import) hiện có → báo cáo mức độ lazy-load.
// Usage: node scripts/audit-lazy-load.mjs
// ==============================================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sidecar = `${root}/apps/desktop/src-tauri/sidecar/server.mjs`;

const HEAVY = ['ai-engine', 'skills', 'agents', 'memory', 'browser-control', 'computer-use', 'code-graph', 'security'];

function main() {
  const source = readFileSync(sidecar, 'utf-8');
  const lines = source.split('\n');
  const staticImports = new Map();
  const dynamicImports = [];
  const lazyHints = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const mod of HEAVY) {
      const re = new RegExp(`['"]([^'"]*${mod}[^'"]*)['"]`);
      const m = line.match(re);
      if (!m) continue;
      if (/^\s*(import|from)\s/.test(line) || /import\s*\(/.test(line) === false && line.includes('from') && !line.includes('import(')) {
        staticImports.set(mod, (staticImports.get(mod) ?? 0) + 1);
      } else if (line.includes('import(')) {
        dynamicImports.push({ line: i + 1, mod, snippet: line.trim().slice(0, 90) });
      }
    }
    if (/lazy|defer|dynamic import/i.test(line)) lazyHints.push(i + 1);
  }

  process.stdout.write('# Lazy-load audit — sidecar server.mjs\n\n');
  process.stdout.write('| Module | Static imports |\n|---|---|\n');
  for (const mod of HEAVY) {
    process.stdout.write(`| ${mod} | ${staticImports.get(mod) ?? 0} |\n`);
  }
  process.stdout.write(`\nDynamic imports (lazy): ${dynamicImports.length}\n`);
  for (const d of dynamicImports.slice(0, 10)) {
    process.stdout.write(`  L${d.line} [${d.mod}] ${d.snippet}\n`);
  }
  process.stdout.write(`\nLazy-load hints (lines): ${lazyHints.length}\n`);
  const totalStatic = HEAVY.reduce((s, m) => s + (staticImports.get(m) ?? 0), 0);
  const verdict =
    dynamicImports.length > 0 || totalStatic === 0
      ? 'OK: lazy-load đã có sẵn (dynamic import) hoặc không nạp tĩnh module nặng.'
      : `WARN: ${totalStatic} static import(s) của module nặng — cân nhắc lazy-load.`;
  process.stdout.write(`\n${verdict}\n`);
}

main();
