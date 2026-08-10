#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - Evals CI gate (v1.1.0 Track 1 P11)
// ------------------------------------------------------------------------------
// Runs the internal eval suite with the offline fixture adapter and fails CI
// when the average score drops below the configured baseline.
// Usage: node scripts/evals-gate.mjs [--baseline 75]
// Env:   EVALS_BASELINE (default 75) · EVALS_OUT (default .ghita/evals)
// ==============================================================================

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = Number(process.env.EVALS_BASELINE ?? 75);
const suite = 'internal-v1.1.0';
const outDir = resolve(process.env.EVALS_OUT ?? join(root, '.ghita', 'evals'));

/** Parse "**Avg score:** 79/100" from the CLI report. */
function parseAverageScore(report) {
  const m = report.match(/Avg score:\*\*\s*(\d+)\/100/);
  return m ? Number(m[1]) : null;
}

function main() {
  const cli = join(root, 'packages', 'evals', 'dist', 'cli.js');
  if (!existsSync(cli)) {
    console.error('[evals-gate] @ghita/evals is not built — run: pnpm --filter @ghita/evals build');
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });
  const report = execFileSync(
    process.execPath,
    [cli, 'run', '--suite', suite, '--adapter', 'fixture', '--db', join(outDir, 'history.db'), '--out', outDir],
    { cwd: root, encoding: 'utf8' },
  );

  const avg = parseAverageScore(report);
  if (avg === null) {
    console.error('[evals-gate] could not parse average score from eval report');
    process.exit(2);
  }

  console.log(`\n[evals-gate] suite=${suite} average=${avg}/100 baseline=${baseline}/100`);
  if (avg < baseline) {
    console.error(`[evals-gate] FAIL: average below baseline (${avg} < ${baseline})`);
    process.exit(1);
  }
  console.log('[evals-gate] PASS');
}

main();
