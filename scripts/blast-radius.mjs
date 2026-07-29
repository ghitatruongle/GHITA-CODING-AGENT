#!/usr/bin/env node
/**
 * v0.4.9 A3: Blast radius — estimate the impact of a git change set.
 *
 * Estimate the impact of a git change set: reports the changed files, the
 * workspace packages they belong to, and the direct dependent packages (via
 * workspace:* dependencies) that could be affected — a cheap "how far does this
 * change reach?" signal for reviewers.
 *
 * Usage:
 *   node scripts/blast-radius.mjs                # vs HEAD
 *   node scripts/blast-radius.mjs --base=main    # vs a base ref
 *   node scripts/blast-radius.mjs --json
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const baseArg = args.find((a) => a.startsWith('--base='));
const base = baseArg ? baseArg.split('=')[1] : 'HEAD';

/** Build a map: workspace dir → { name, deps: string[] }. */
function collectWorkspaces() {
  const map = new Map();
  for (const group of ['packages', 'apps']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(base, entry.name, 'package.json');
      if (!existsSync(pkgPath)) continue;
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      } catch {
        continue;
      }
      const deps = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
        .filter(([, v]) => typeof v === 'string' && v.startsWith('workspace:'))
        .map(([k]) => k);
      map.set(`${group}/${entry.name}`, { name: pkg.name, deps });
    }
  }
  return map;
}

/** Changed files vs the base ref. */
function changedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--name-only', base], {
      cwd: root,
      encoding: 'utf8',
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (error) {
    process.stderr.write(`blast-radius: git diff failed: ${error.message}\n`);
    return [];
  }
}

function main() {
  const workspaces = collectWorkspaces();
  const files = changedFiles();

  // Which workspaces contain a changed file?
  const touched = new Set();
  for (const file of files) {
    for (const dir of workspaces.keys()) {
      if (file.startsWith(`${dir}/`)) touched.add(dir);
    }
  }

  // Direct dependents: workspaces whose deps include a touched workspace's name.
  const touchedNames = new Set([...touched].map((d) => workspaces.get(d)?.name).filter(Boolean));
  const dependents = new Set();
  for (const [dir, info] of workspaces) {
    if (touched.has(dir)) continue;
    if (info.deps.some((d) => touchedNames.has(d))) dependents.add(dir);
  }

  const report = {
    base,
    changedFileCount: files.length,
    touchedPackages: [...touched].sort(),
    directDependents: [...dependents].sort(),
    blastRadius: touched.size + dependents.size,
  };

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  console.info(`Blast radius (vs ${base}):`);
  console.info(`  Changed files:     ${report.changedFileCount}`);
  console.info(`  Touched packages:  ${report.touchedPackages.join(', ') || '(none)'}`);
  console.info(`  Direct dependents: ${report.directDependents.join(', ') || '(none)'}`);
  console.info(`  Total reach:       ${report.blastRadius} package(s)`);
}

main();
