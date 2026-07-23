#!/usr/bin/env node
/**
 * Count code smells used as v0.1.5 quality slash metrics.
 *
 * Usage:
 *   node scripts/count-smells.mjs
 *   node scripts/count-smells.mjs --max-as-any=130
 *   node scripts/count-smells.mjs --json
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'build', 'target', '.git']);
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const maxAsAnyArg = args.find((a) => a.startsWith('--max-as-any='));
const maxAsAny = maxAsAnyArg ? Number(maxAsAnyArg.split('=')[1]) : null;

const patterns = {
  any_type: /\bany\b/g,
  as_any: /\bas\s+any\b/g,
  console_log: /console\.(log|debug|info)\(/g,
  ts_ignore: /@ts-ignore|@ts-expect-error|@ts-nocheck/g,
  eslint_disable: /eslint-disable/g,
};

const counts = Object.fromEntries(Object.keys(patterns).map((k) => [k, 0]));
let files = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.') continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (skip.has(ent.name)) continue;
      walk(full);
      continue;
    }
    if (!exts.has(extname(ent.name))) continue;
    const rel = full.slice(root.length + 1).replace(/\\/g, '/');
    if (!/^(packages|apps|tests|scripts)\//.test(rel)) continue;
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    files++;
    for (const [k, re] of Object.entries(patterns)) {
      const m = text.match(re);
      if (m) counts[k] += m.length;
    }
  }
}

walk(root);
const payload = {
  files,
  counts,
  targets: { as_any: 130 },
  ok: maxAsAny == null ? true : counts.as_any <= maxAsAny,
};

if (jsonOnly) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(JSON.stringify(payload, null, 2));
  if (maxAsAny != null) {
    if (counts.as_any > maxAsAny) {
      console.error(
        `FAIL: as_any=${counts.as_any} exceeds max ${maxAsAny}`,
      );
      process.exit(1);
    }
    console.log(`OK: as_any=${counts.as_any} <= ${maxAsAny}`);
  }
}
