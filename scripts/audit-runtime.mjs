#!/usr/bin/env node

// Usage: node scripts/audit-runtime.mjs

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
  'packages/mcp/src',
  'packages/evals/src',
  'packages/resource-budget/src',
  'apps/desktop/src',
  'apps/mobile/src',
];

const RULES = [
  { id: 'R5-timer', test: /setInterval\s*\(/, label: 'setInterval (cần cleanup)', severity: 'medium' },
  { id: 'R5-timer2', test: /setTimeout\s*\([^)]*\)\s*;\s*$/, label: 'setTimeout không unref/clear', severity: 'low' },
  { id: 'R5-no-catch', test: /\.then\([^)]*\)\s*;\s*$/, label: 'promise .then không catch', severity: 'medium' },
  { id: 'R5-async-void', test: /^\s*void\s+\w+\(/, label: 'void bỏ promise (có chủ đích?)', severity: 'low' },
  { id: 'R6-split-slash', test: /\.split\('\/'\)/, label: 'split("/") — Windows path sai', severity: 'medium' },
  { id: 'R6-path-lower', test: /\.toLowerCase\(\)\s*===?\s*['"`][a-z\\]/i, label: 'so sánh path lowercase', severity: 'low' },
  { id: 'R6-hardcode-win', test: /['"]C:\\\\|['"]D:\\\\|['"]\\\\Program Files/, label: 'hardcode Windows path', severity: 'medium' },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'test', 'tests', '__tests__', '.test', '.spec'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|mjs)$/.test(name)) files.push(full);
  }
  return files;
}

function main() {
  const findings = [];
  for (const target of TARGETS) {
    for (const file of walk(join(root, target))) {
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
            snippet: line.trim().slice(0, 90),
          });
        }
      }
    }
  }

  const byId = findings.reduce((m, f) => ((m[f.id] = (m[f.id] ?? 0) + 1), m), {});
  process.stdout.write('# Runtime audit findings (R5/R6)\n\n');
  process.stdout.write(`| ID | Count | Severity |\n|---|---|---|\n`);
  for (const [id, count] of Object.entries(byId)) {
    const severity = RULES.find((r) => r.id === id)?.severity ?? 'low';
    process.stdout.write(`| ${id} | ${count} | ${severity} |\n`);
  }
  process.stdout.write(`\nTOTAL=${findings.length}\n\nChi tiết (mẫu mỗi rule):\n`);
  const seen = new Set();
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    process.stdout.write(`- [${f.id}] ${f.file}:${f.line} \`${f.snippet}\`\n`);
  }
}

main();
