#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT — Dogfooding Script (v0.1.5 integrity-first)
// Run: pnpm dogfood
// ==============================================================================

import { execSync } from 'node:child_process';

const PASS = '✅';
const FAIL = '❌';
let passed = 0;
let failed = 0;

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

console.log('\n🐕 GHITA CODING AGENT — Dogfooding (v0.1.5)\n');

console.log('🔐 Integrity:');
run('version sync', 'node scripts/sync-version.mjs --check');
run('artifacts', 'node scripts/check-artifacts.mjs');
run('smell budget (as any ≤ 130)', 'node scripts/count-smells.mjs --max-as-any=130');

console.log('\n📦 Build:');
run('build:packages', 'pnpm build:packages');

console.log('\n🔍 Lint & Typecheck:');
run('typecheck', 'pnpm typecheck');
run('lint', 'pnpm lint');

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
run('security coverage', 'pnpm --filter @ghita/security exec vitest run --coverage');
run('agents coverage', 'pnpm --filter @ghita/agents exec vitest run --coverage');
run(
  'communication coverage',
  'pnpm --filter @ghita/communication exec vitest run --coverage',
);
run('ai-engine coverage', 'pnpm --filter @ghita/ai-engine exec vitest run --coverage');
run('memory coverage', 'pnpm --filter @ghita/memory exec vitest run --coverage');
run('skills coverage', 'pnpm --filter @ghita/skills exec vitest run --coverage');
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
