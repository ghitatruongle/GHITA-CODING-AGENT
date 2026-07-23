#!/usr/bin/env node
/**
 * Enforce honest tiered coverage floors from docs/coverage-tiers.json.
 *
 * Usage:
 *   node scripts/check-coverage-tiers.mjs
 *   node scripts/check-coverage-tiers.mjs --allow-missing
 *   node scripts/check-coverage-tiers.mjs --tiers=T0,T1
 *   node scripts/check-coverage-tiers.mjs --require-summaries
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowMissing = args.includes('--allow-missing');
const requireSummaries = args.includes('--require-summaries') || !allowMissing;
const tiersArg = args.find((a) => a.startsWith('--tiers='));
const onlyTiers = tiersArg
  ? new Set(
      tiersArg
        .slice('--tiers='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

const tiersPath = join(root, 'docs/coverage-tiers.json');
const policy = JSON.parse(readFileSync(tiersPath, 'utf8'));

const floors = new Map();
for (const [tierName, tier] of Object.entries(policy.tiers)) {
  if (onlyTiers && !onlyTiers.has(tierName)) continue;
  if (!tier.packages) continue;
  for (const [pkg, cfg] of Object.entries(tier.packages)) {
    floors.set(pkg, {
      floor: cfg.lines ?? tier.defaultLines ?? 30,
      tier: tierName,
    });
  }
}

let failed = 0;
let checked = 0;
let missing = 0;

for (const [pkg, meta] of floors) {
  const summaryPath = join(root, pkg, 'coverage/coverage-summary.json');
  if (!existsSync(summaryPath)) {
    missing++;
    const msg = `${pkg}: missing coverage-summary.json (floor ${meta.floor}%, tier ${meta.tier})`;
    if (allowMissing && !requireSummaries) {
      console.warn('WARN', msg);
    } else {
      // For T0/T1 always fail if requireSummaries; for others with allowMissing warn
      const critical = meta.tier === 'T0' || meta.tier === 'T1';
      if (critical || requireSummaries) {
        console.error('FAIL', msg);
        failed++;
      } else {
        console.warn('WARN', msg);
      }
    }
    continue;
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const actual = summary?.total?.lines?.pct;
  if (typeof actual !== 'number') {
    console.error(`FAIL ${pkg}: invalid coverage summary`);
    failed++;
    continue;
  }
  checked++;
  const status = actual + 1e-9 >= meta.floor ? 'OK' : 'FAIL';
  console.log(
    `${status} ${pkg}: ${actual}% lines (floor ${meta.floor}%, tier ${meta.tier})`,
  );
  if (status === 'FAIL') failed++;
}

console.log(
  `Checked ${checked} packages, missing=${missing}, failures=${failed}`,
);
if (failed > 0) process.exit(1);
