#!/usr/bin/env node
/**
 * v0.4.9 A3: Mapping gate — every changed source file should have a test.
 *
 * For each changed non-test source file under a package's src directory, checks
 * whether a plausible test exists (same-name .test/.spec, or any test file in
 * the package's tests/ dir). Reports unmapped files.
 *
 * Usage:
 *   node scripts/mapping-gate.mjs            # warn only (exit 0)
 *   node scripts/mapping-gate.mjs --strict   # exit 1 if any unmapped file
 *   node scripts/mapping-gate.mjs --base=main
 *   node scripts/mapping-gate.mjs --json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const jsonOnly = args.includes('--json');
const baseArg = args.find((a) => a.startsWith('--base='));
const base = baseArg ? baseArg.split('=')[1] : 'HEAD';

const SRC_RE = /^(packages|apps)\/[^/]+\/src\/.*\.(ts|tsx)$/;
const TEST_RE = /\.(test|spec)\.(ts|tsx)$/;
const IGNORE_RE = /(\.d\.ts$|\/index\.ts$|\/types\.ts$)/;

function changedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--name-only', base], {
      cwd: root,
      encoding: 'utf8',
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean).map((f) => f.replace(/\\/g, '/'));
  } catch (error) {
    process.stderr.write(`mapping-gate: git diff failed: ${error.message}\n`);
    return [];
  }
}

/** Recursively list files under dir (returns absolute paths). */
function listFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/** True if a plausible test exists for the given repo-relative source file. */
function hasTest(relFile) {
  const pkgDir = relFile.split('/').slice(0, 2).join('/'); // packages/<name>
  const absPkg = join(root, pkgDir);
  const stem = basename(relFile).replace(/\.(ts|tsx)$/, '');

  // 1) Same-name test anywhere in the package.
  const candidates = listFiles(absPkg).map((f) => f.replace(/\\/g, '/'));
  const sameName = candidates.some(
    (f) => TEST_RE.test(f) && basename(f).replace(TEST_RE, '') === stem,
  );
  if (sameName) return true;

  // 2) Non-empty tests/ dir in the package (package-level coverage).
  const testsDir = join(absPkg, 'tests');
  if (existsSync(testsDir)) {
    const anyTest = listFiles(testsDir).some((f) => TEST_RE.test(f.replace(/\\/g, '/')));
    if (anyTest) return true;
  }
  return false;
}

function main() {
  const files = changedFiles().filter((f) => SRC_RE.test(f) && !TEST_RE.test(f) && !IGNORE_RE.test(f));
  const unmapped = files.filter((f) => !hasTest(f));

  const report = { base, changedSourceFiles: files.length, unmapped };

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (unmapped.length === 0) {
    console.info(`mapping-gate: OK — ${files.length} changed source file(s) have tests.`);
  } else {
    console.warn(`mapping-gate: ${unmapped.length} changed source file(s) without a mapped test:`);
    for (const f of unmapped) console.warn(`  - ${f}`);
  }

  if (strict && unmapped.length > 0) process.exit(1);
}

void extname; // reserved for future per-extension rules
void statSync;
main();
