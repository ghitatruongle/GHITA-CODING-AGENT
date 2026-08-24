#!/usr/bin/env node

//   [2] evals suite internal (fixture adapter)

//   [4] MCP interop (codegraph/browser/memory/skills qua SDK)
// Usage: node scripts/e2e-smoke.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.ghita', 'e2e-smoke');
mkdirSync(tmp, { recursive: true });

function run(nodeArgs, cwd = root) {
  return execFileSync(process.execPath, nodeArgs, { cwd, encoding: 'utf8' });
}

async function main() {
  const results = [];
  const failures = [];

  // [1] ingest CLI
  try {
    writeFileSync(join(tmp, 'sample.md'), '# Smoke\n\nE2E content '.repeat(40));
    const out = run([
      join(root, 'packages', 'ingest', 'dist', 'cli.js'),
      join(tmp, 'sample.md'),
      '--out', join(tmp, 'out'),
    ]);
    const ok = out.includes('chunks');
    results.push(['ingest-cli', ok]);
    if (!ok) failures.push('ingest-cli');
  } catch (e) {
    failures.push(`ingest-cli: ${e instanceof Error ? e.message : e}`);
  }

  // [2] evals internal suite (fixture)
  try {
    const out = run([
      join(root, 'packages', 'evals', 'dist', 'cli.js'),
      'run', '--suite', 'internal-v1.1.0', '--adapter', 'fixture',
      '--out', join(tmp, 'evals'),
    ]);
    const ok = out.includes('Avg score');
    results.push(['evals-internal', ok]);
    if (!ok) failures.push('evals-internal');
  } catch (e) {
    failures.push(`evals-internal: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const { SecurityScanner } = await import('../packages/security/dist/index.js');
    const scanner = new SecurityScanner();
    const findings = scanner.scanContentFast(
      'a.ts',
      "const key = 'sk-proj-abcdef1234567890abcdef1234567890';",
    );
    const ok = findings.length > 0;
    results.push(['security-scanner', ok]);
    if (!ok) failures.push('security-scanner');
  } catch (e) {
    failures.push(`security-scanner: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const out = run([join(root, 'scripts', 'mcp-interop-check.mjs')]);
    const ok = out.includes('all servers OK');
    results.push(['mcp-interop', ok]);
    if (!ok) failures.push('mcp-interop');
  } catch (e) {
    failures.push(`mcp-interop: ${e instanceof Error ? e.message : e}`);
  }

  process.stdout.write('# E2E integration smoke (F6)\n\n');
  for (const [name, ok] of results) {
    process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] ${name}\n`);
  }
  if (failures.length > 0) {
    process.stderr.write(`SMOKE FAILED: ${failures.join('; ')}\n`);
    process.exit(1);
  }
  process.stdout.write('SMOKE OK — 4 luồng integration hoạt động\n');
}

main().catch((err) => {
  process.stderr.write(`SMOKE ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
