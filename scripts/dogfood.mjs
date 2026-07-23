#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT — Dogfooding Script (v0.1.5 integrity-first)
// Run: pnpm dogfood
// ==============================================================================

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PASS = '✅';
const FAIL = '❌';
let passed = 0;
let failed = 0;

const isWin = process.platform === 'win32';
// On Windows, turbo spawns many tsc/vitest workers in parallel which can
// exhaust the Node.js default heap. Bump to 8 GB for safety.
const heapPrefix = isWin ? 'set NODE_OPTIONS=--max-old-space-size=8192 && ' : 'NODE_OPTIONS=--max-old-space-size=8192 ';

function run(name, cmd, { optional = false } = {}) {
  process.stdout.write(`  ${name}... `);
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 600_000 });
    console.log(PASS);
    passed++;
  } catch (e) {
    console.log(optional ? '⚠️' : FAIL);
    if (e.stderr) console.error(`    ${e.stderr.toString().trim().split('\n')[0]}`);
    if (!optional) failed++;
  }
}

// Run coverage only if the summary is missing — avoids OOM from re-running
// heavy vitest coverage workers when summaries already exist.
function runCoverage(name, pkg) {
  const summary = `packages/${pkg}/coverage/coverage-summary.json`;
  if (existsSync(summary)) {
    process.stdout.write(`  ${name}... ${PASS} (cached)\n`);
    passed++;
    return;
  }
  run(name, `${heapPrefix}pnpm --filter @ghita/${pkg} exec vitest run --coverage`);
}

console.log('\n🐕 GHITA CODING AGENT — Dogfooding (v0.1.5)\n');

console.log('🔐 Integrity:');
run('version sync', 'node scripts/sync-version.mjs --check');
run('artifacts', 'node scripts/check-artifacts.mjs');
run('smell budget (as any ≤ 130)', 'node scripts/count-smells.mjs --max-as-any=130');

console.log('\n📦 Build:');
run('build:packages', 'pnpm build:packages');

console.log('\n🔍 Lint & Typecheck:');
// Limit turbo concurrency to avoid Windows heap exhaustion when 22+ tsc
// instances spawn in parallel.
run('typecheck', 'npx turbo typecheck --concurrency=1');
run('lint', 'npx turbo lint --concurrency=1');

console.log('\n🧪 Core tests:');
run('security', 'pnpm --filter @ghita/security test');
run('agents', 'pnpm --filter @ghita/agents test');
run(
  'computer-use security paths',
  'pnpm --filter @ghita/computer-use exec vitest run tests/security-paths.security.test.ts',
);
run(
  'browser-control security paths',
  'pnpm --filter @ghita/browser-control exec vitest run src/security-paths.security.test.ts',
);

console.log('\n📊 Coverage (T0/T1 required summaries + floors):');
// Generate coverage for gated packages so summaries exist.
// Skip re-run if summary already cached (avoids Windows OOM on heavy vitest).
runCoverage('security coverage', 'security');
runCoverage('agents coverage', 'agents');
runCoverage('communication coverage', 'communication');
runCoverage('ai-engine coverage', 'ai-engine');
runCoverage('memory coverage', 'memory');
runCoverage('skills coverage', 'skills');
run(
  'tier floors T0/T1',
  'node scripts/check-coverage-tiers.mjs --tiers=T0,T1 --require-summaries',
);

console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n⚠️  Some checks failed. Please fix before releasing.');
  process.exit(1);
}
console.log('\n🎉 Integrity dogfood passed.');
