#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - Resource budget gate (v1.1.0 Track 9 B10)
// ------------------------------------------------------------------------------
// Validates docs/resource-budget.json + runs the BudgetRegistry against the
// caps (sample usage = 0 → mọi module trong budget). CI gate: exit 1 khi cap
// sai hoặc module thiếu.
// Usage: node scripts/check-resource-budget.mjs [--verbose]
// ==============================================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BudgetRegistry } from '../packages/resource-budget/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'docs', 'resource-budget.json');
const verbose = process.argv.includes('--verbose');

function main() {
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const registry = new BudgetRegistry();
  for (const cap of config.caps) {
    registry.register(cap);
  }

  const problems = [];
  for (const cap of config.caps) {
    if (cap.maxBytes < 0) problems.push(`negative cap: ${cap.module}`);
    if (typeof cap.hardLimit !== 'boolean') problems.push(`missing hardLimit: ${cap.module}`);
  }
  if (!Array.isArray(config.caps) || config.caps.length === 0) {
    problems.push('caps array empty');
  }
  if (!config.targets || !config.targets.desktopRssMb || !config.targets.sidecarRssMb) {
    problems.push('targets missing desktopRssMb/sidecarRssMb');
  }

  // Deny-default: module không đăng ký phải bị từ chối.
  if (registry.account('unknown.module', 1) !== false) {
    problems.push('unregistered module not denied (deny-default violated)');
  }

  if (verbose) {
    process.stdout.write(`Loaded ${config.caps.length} caps from ${configPath}\n`);
    for (const state of registry.listStates()) {
      process.stdout.write(`  ${state.module}: cap=${state.maxBytes} used=${state.usedBytes} ratio=${state.ratio.toFixed(3)}\n`);
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`[resource-budget] FAIL:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('[resource-budget] OK: all caps valid, deny-default enforced\n');
}

main();
