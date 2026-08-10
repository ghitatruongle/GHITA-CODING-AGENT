#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - Bug→test mapping gate (v1.1.0 Track 11 F4 / Track 12 G1)
// ------------------------------------------------------------------------------
// Đọc docs/code-review-findings.md: mọi finding có status "fixed" PHẢI có
// TestFile tồn tại trên đĩa — exit 1 nếu thiếu. Findings "closed-verified"
// không cần TestFile.
// Usage: node scripts/check-bug-tests.mjs [--verbose]
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'docs', 'code-review-findings.md');
const verbose = process.argv.includes('--verbose');

function main() {
  const content = readFileSync(registryPath, 'utf-8');
  const fixed = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('| CR-')) continue;
    if (!line.includes('**fixed**')) continue;
    const cols = line.split('|').map((c) => c.trim());
    const id = cols[1] ?? '';
    const testMatch = line.match(/`([\w./-]+\.test\.(?:ts|tsx))`/);
    fixed.push({ id, testFile: testMatch?.[1] ?? '' });
  }

  const problems = [];
  for (const f of fixed) {
    if (!f.testFile) {
      problems.push(`${f.id}: fixed nhưng thiếu TestFile`);
      continue;
    }
    const candidates = [
      join(root, 'packages', 'ai-engine', 'src', f.testFile),
      join(root, 'packages', 'ai-engine', 'src', 'tools', f.testFile),
      join(root, 'packages', 'ai-engine', 'src', 'cache', f.testFile),
      join(root, 'packages', 'ai-engine', 'src', 'tool-calling', f.testFile),
      join(root, 'packages', 'ingest', 'src', f.testFile),
      join(root, 'packages', 'security', 'src', f.testFile),
      join(root, 'packages', 'security', 'tests', f.testFile),
      join(root, 'packages', 'code-graph', 'src', f.testFile),
      join(root, 'packages', 'skills', 'src', f.testFile),
      join(root, 'packages', 'marketplace', 'src', f.testFile),
      join(root, 'packages', 'resource-budget', 'src', f.testFile),
      join(root, 'packages', 'terminal-session', 'src', f.testFile),
      join(root, 'packages', 'memory', 'src', f.testFile),
    ];
    if (!candidates.some((c) => existsSync(c))) {
      problems.push(`${f.id}: TestFile "${f.testFile}" không tồn tại`);
    }
  }

  if (verbose) {
    process.stdout.write(`Fixed findings: ${fixed.length}\n`);
    for (const f of fixed) process.stdout.write(`  ${f.id} → ${f.testFile}\n`);
  }

  if (problems.length > 0) {
    process.stderr.write(`[check-bug-tests] FAIL:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`[check-bug-tests] OK: ${fixed.length} fixed findings đều có TestFile\n`);
}

main();
