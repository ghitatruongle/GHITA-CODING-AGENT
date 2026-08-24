#!/usr/bin/env node

// Builds all napi-rs addons for the current platform:
//   crates/secscan · crates/retrieval · crates/codegraph · packages/memory/rust-napi
// Outputs land next to each crate dir (*.node) where @ghita/native-bridge and
// the memory loader probe for them.
// Usage: node scripts/build-native.mjs [--skip-tests]

import { execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipTests = process.argv.includes('--skip-tests');

/** crates that build the napi surface behind the `addon` feature. */
const ADDON_CRATES = [
  { name: 'secscan', dir: 'crates/secscan', args: ['--features', 'addon'] },
  { name: 'retrieval', dir: 'crates/retrieval', args: ['--features', 'addon'] },
  { name: 'codegraph', dir: 'crates/codegraph', args: ['--features', 'addon'] },
  { name: 'sandbox', dir: 'crates/sandbox', args: ['--features', 'addon'] },
  { name: 'tokenizer', dir: 'crates/tokenizer', args: ['--features', 'addon'] },
  { name: 'docloader', dir: 'crates/docloader', args: ['--features', 'addon'] },
  { name: 'store', dir: 'crates/store', args: ['--features', 'addon'] },
  // memory addon lives in the package tree (its own Cargo.lock, no features)
  { name: 'memory-napi', dir: 'packages/memory/rust-napi', args: [] },
];

function sh(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

if (!skipTests) {
  console.log('== cargo test (workspace) ==');
  sh('cargo test --workspace', { cwd: join(root, 'crates'), env: { ...process.env, RUST_MIN_STACK: '134217728', CARGO_BUILD_JOBS: '1' } });
  console.log('\n== cargo test (memory addon) ==');
  sh('cargo test', { cwd: join(root, 'packages/memory/rust-napi') });
}

for (const crate of ADDON_CRATES) {
  const cwd = join(root, crate.dir);
  const featureArgs = crate.args.join(' ');
  console.log(`\n== napi build ${crate.name} (${crate.dir}) ==`);
  sh(
    `pnpm --filter @ghita/memory exec napi build --cwd "${cwd.replaceAll('\\', '/')}" --platform --release ${featureArgs}`,
    { cwd: root },
  );
}

console.log('\nAll native addons built.');

// NOTE: the CPU bench gate is non-blocking on push (see build-native.yml) —
// shared-runner micro-bench variance; blocking only in quality-gates (PR/nightly).
