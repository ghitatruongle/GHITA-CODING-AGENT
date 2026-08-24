#!/usr/bin/env node

//   [S2] eval/new Function

//   [S5] innerHTML/document.write (XSS)

// Usage: node scripts/audit-security.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  'packages/ai-engine/src',
  'packages/skills/src',
  'packages/agents/src',
  'packages/memory/src',
  'packages/security/src',
  'packages/code-graph/src',
  'packages/browser-control/src',
  'packages/ingest/src',
  'packages/marketplace/src',
  'packages/communication/src',
  'packages/computer-use/src',
  'apps/desktop/src-tauri/src',
  'apps/desktop/src',
];

const RULES = [
  { id: 'S1-exec', test: /(exec|spawn|execSync)\s*\([^)]*\+/, label: 'exec với chuỗi nối', severity: 'high' },
  { id: 'S2-eval', test: /\beval\s*\(|new Function\s*\(/, label: 'eval/new Function', severity: 'high' },
  { id: 'S3-path', test: /(readFileSync|writeFileSync|join|resolve)\s*\([^)]*(input|args|query|params|userInput|req\.)/, label: 'path từ input user', severity: 'medium' },
  { id: 'S4-secret', test: /['"](?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})['"]/, label: 'secret literal', severity: 'high' },
  { id: 'S5-xss', test: /\.innerHTML\s*=|document\.write\s*\(/, label: 'innerHTML/document.write', severity: 'high' },
  { id: 'S6-dynamic-url', test: /fetch\s*\([^)]*(url|endpoint|target|host)/, label: 'fetch URL động', severity: 'medium' },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'test', 'tests', '__tests__', '.test', '.spec'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|mjs|rs)$/.test(name)) files.push(full);
  }
  return files;
}

function main() {
  const findings = [];
  for (const target of TARGETS) {
    const files = walk(join(root, target));
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        for (const rule of RULES) {
          if (!rule.test.test(line)) continue;
          findings.push({
            id: rule.id,
            severity: rule.severity,
            file: file.replace(root + '/', ''),
            line: i + 1,
            snippet: line.trim().slice(0, 100),
          });
        }
      }
    }
  }

  process.stdout.write('# Security audit findings (R4)\n\n');
  process.stdout.write(`| ID | Severity | File:Line | Snippet |\n|---|---|---|---|\n`);
  for (const f of findings) {
    process.stdout.write(`| ${f.id} | ${f.severity} | \`${f.file}:${f.line}\` | \`${f.snippet}\` |\n`);
  }
  const bySeverity = findings.reduce((m, f) => ((m[f.severity] = (m[f.severity] ?? 0) + 1), m), {});
  process.stdout.write(`\nTổng: ${JSON.stringify(bySeverity)} · TOTAL=${findings.length}\n`);
}

main();
