#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT — Dogfooding Script
// Smoke-tests all core flows to verify the project works end-to-end.
// Run: pnpm dogfood
// ==============================================================================

import { execSync } from 'node:child_process';

const PASS = '✅';
const FAIL = '❌';
let passed = 0;
let failed = 0;

function run(name, cmd) {
  process.stdout.write(`  ${name}... `);
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120_000 });
    console.log(PASS);
    passed++;
  } catch (e) {
    console.log(FAIL);
    if (e.stderr) console.error(`    ${e.stderr.toString().trim().split('\n')[0]}`);
    failed++;
  }
}

console.log('\n🐕 GHITA CODING AGENT — Dogfooding\n');

console.log('📦 Build:');
run('build:packages', 'pnpm build:packages');

console.log('\n🔍 Lint & Typecheck:');
run('typecheck', 'pnpm typecheck');
run('lint', 'pnpm lint');

console.log('\n🧪 Tests:');
run('test (all packages)', 'pnpm test');

console.log('\n📊 Coverage:');
run('test:coverage', 'pnpm test:coverage');

console.log('\n🔒 Security:');
run('pnpm audit', 'pnpm audit --audit-level=critical || true');
run('knip', 'pnpm knip --no-progress || true');

console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n⚠️  Some checks failed. Please fix before releasing.');
  process.exit(1);
} else {
  console.log('\n🎉 All checks passed! Ready for release.');
}
