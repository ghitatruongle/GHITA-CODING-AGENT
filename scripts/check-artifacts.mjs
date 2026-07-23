#!/usr/bin/env node
/**
 * Fail if forbidden artifacts are tracked by git or present at repo root.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenPatterns = [/\/nul$/, /^nul$/, /\.log$/, /\.sqlite$/];

let tracked = '';
try {
  tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' });
} catch {
  console.warn('git ls-files failed; skipping tracked check');
}

const badTracked = tracked
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((f) => forbiddenPatterns.some((re) => re.test(f.replace(/\\/g, '/'))));

const badPresent = ['nul', 'test-output.log', 'test-ledger.sqlite']
  .map((f) => join(root, f))
  .filter((p) => existsSync(p));

let failed = false;
if (badTracked.length) {
  failed = true;
  console.error('Forbidden tracked files:');
  for (const f of badTracked) console.error(' -', f);
}
if (badPresent.length) {
  failed = true;
  console.error('Forbidden untracked/local artifacts present:');
  for (const f of badPresent) console.error(' -', f);
}

if (failed) process.exit(1);
console.log('OK: no forbidden artifacts');
