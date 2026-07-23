#!/usr/bin/env node
/**
 * Sync / check monorepo package versions.
 *
 *   node scripts/sync-version.mjs            # write 0.1.5 everywhere
 *   node scripts/sync-version.mjs --check    # fail if drift
 *   node scripts/sync-version.mjs --set 0.1.6
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const setIdx = args.indexOf('--set');
const TARGET = setIdx >= 0 ? args[setIdx + 1] : '0.1.5';

if (!TARGET || !/^\d+\.\d+\.\d+([.-].+)?$/.test(TARGET)) {
  console.error(`Invalid version: ${TARGET}`);
  process.exit(2);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function collectPackageJsons() {
  const paths = [join(root, 'package.json')];
  for (const dir of ['packages', 'apps']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const p = join(base, name.name, 'package.json');
      if (existsSync(p)) paths.push(p);
    }
  }
  return paths;
}

const drifts = [];
const packageJsons = collectPackageJsons();

for (const p of packageJsons) {
  const data = readJson(p);
  if (data.version !== TARGET) {
    drifts.push(`${p}: ${data.version} != ${TARGET}`);
    if (!checkOnly) {
      data.version = TARGET;
      writeJson(p, data);
    }
  }
}

const manifestPath = join(root, '.release-please-manifest.json');
if (existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  if (manifest['.'] !== TARGET) {
    drifts.push(`.release-please-manifest.json: ${manifest['.']} != ${TARGET}`);
    if (!checkOnly) {
      manifest['.'] = TARGET;
      writeJson(manifestPath, manifest);
    }
  }
}

// Lightweight prose checks (informational for --check, not auto-rewritten)
const proseChecks = [
  { file: 'packages/security/src/index.ts', re: /SECURITY_VERSION\s*=\s*['"]([^'"]+)['"]/ },
  { file: 'packages/agents/src/index.ts', re: /AGENTS_VERSION\s*=\s*['"]([^'"]+)['"]/ },
  { file: 'packages/computer-use/src/index.ts', re: /COMPUTER_USE_VERSION\s*=\s*['"]([^'"]+)['"]/ },
  { file: 'packages/browser-control/src/index.ts', re: /BROWSER_CONTROL_VERSION\s*=\s*['"]([^'"]+)['"]/ },
];

for (const { file, re } of proseChecks) {
  const full = join(root, file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, 'utf8');
  const m = text.match(re);
  if (m && m[1] !== TARGET) {
    drifts.push(`${file}: ${m[1]} != ${TARGET}`);
    if (!checkOnly) {
      writeFileSync(full, text.replace(re, (whole, _v) => whole.replace(_v, TARGET)), 'utf8');
    }
  }
}

if (checkOnly) {
  if (drifts.length) {
    console.error('Version drift detected:');
    for (const d of drifts) console.error(' -', d);
    process.exit(1);
  }
  console.log(`OK: all checked versions are ${TARGET}`);
  process.exit(0);
}

console.log(`Synced version -> ${TARGET}`);
if (drifts.length) {
  console.log(`Updated ${drifts.length} locations.`);
} else {
  console.log('Already in sync.');
}
