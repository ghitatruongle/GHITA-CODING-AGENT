// ==============================================================================
// GHITA CODING AGENT — Audit Fix 2.9 Regression Tests
//
// Covers the budget-persistence fix in `BudgetManager`:
// the previous implementation kept `spent` entirely in RAM, so the
// budget reset to zero on every application restart. Worse, there was
// no scheduler to reset the budget when the daily/weekly/monthly period
// elapsed.
//
// The fix:
//   * `persistencePath` option writes/reads JSON state on every change
//   * `checkAutoReset()` clears `spent` when the configured period elapsed
//   * A corrupt JSON file is treated as "start fresh" (non-throwing)
//
// These tests use a temp directory for the persistence file so they don't
// pollute the repo.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BudgetManager } from '../src/cost/budget.js';

describe('Audit Fix 2.9 — BudgetManager persistence + auto-reset', () => {
  let tmpDir: string;
  let persistencePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghita-budget-'));
    persistencePath = path.join(tmpDir, 'budget.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists spent amount across BudgetManager instances', () => {
    const first = new BudgetManager({ limit: 100, persistencePath });
    first.recordSpent(25);
    first.recordSpent(10);
    expect(first.getCurrentSpent()).toBe(35);

    // New instance reading the same file should restore the spent amount
    // (audit fix 2.9: budget survives restart).
    const second = new BudgetManager({ limit: 100, persistencePath });
    expect(second.getCurrentSpent()).toBe(35);
  });

  it('writes a JSON file containing spent, triggeredThresholds, lastResetAt', () => {
    const mgr = new BudgetManager({ limit: 50, persistencePath });
    mgr.recordSpent(20);

    expect(fs.existsSync(persistencePath)).toBe(true);
    const raw = fs.readFileSync(persistencePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      spent: number;
      triggeredThresholds: number[];
      lastResetAt: number;
    };
    expect(parsed.spent).toBe(20);
    expect(Array.isArray(parsed.triggeredThresholds)).toBe(true);
    expect(typeof parsed.lastResetAt).toBe('number');
  });

  it('creates the parent directory if missing', () => {
    const nestedPath = path.join(tmpDir, 'nested', 'deeper', 'budget.json');
    const mgr = new BudgetManager({ limit: 100, persistencePath: nestedPath });
    mgr.recordSpent(1);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('handles a corrupt JSON file without throwing — falls back to zero', () => {
    fs.writeFileSync(persistencePath, '{not valid json', 'utf8');
    expect(() => new BudgetManager({ limit: 100, persistencePath })).not.toThrow();
    const mgr = new BudgetManager({ limit: 100, persistencePath });
    expect(mgr.getCurrentSpent()).toBe(0);
  });

  it('handles a missing file by starting at zero', () => {
    // No writeFileSync — file does not exist.
    const mgr = new BudgetManager({ limit: 100, persistencePath });
    expect(mgr.getCurrentSpent()).toBe(0);
  });

  it('ignores a negative spent value in the persisted file', () => {
    fs.writeFileSync(
      persistencePath,
      JSON.stringify({ spent: -50, triggeredThresholds: [], lastResetAt: Date.now() }),
      'utf8',
    );
    const mgr = new BudgetManager({ limit: 100, persistencePath });
    // Constructor should refuse to load -50 and fall back to zero.
    expect(mgr.getCurrentSpent()).toBe(0);
  });

  it('persists triggered alert thresholds across restarts (when onAlert is set)', () => {
    const fired: number[] = [];
    const first = new BudgetManager({
      limit: 100,
      alertThresholds: [0.5, 0.8, 1.0],
      onAlert: (_spent, _limit, pct) => {
        fired.push(pct);
      },
      persistencePath,
    });
    first.recordSpent(55); // crosses 0.5
    first.recordSpent(30); // 85 total — crosses 0.8
    first.recordSpent(20); // 105 total — crosses 1.0

    expect(fired.length).toBe(3);

    // New instance — reloading should restore the triggered thresholds so
    // we don't double-fire when crossing them again.
    const firedAfterReload: number[] = [];
    const second = new BudgetManager({
      limit: 100,
      alertThresholds: [0.5, 0.8, 1.0],
      onAlert: (_spent, _limit, pct) => {
        firedAfterReload.push(pct);
      },
      persistencePath,
    });
    // No new recordSpent yet — no new alerts should fire on reload.
    expect(firedAfterReload.length).toBe(0);

    // One more recordSpent — alert should NOT re-fire because the thresholds
    // are already in the persisted set.
    second.recordSpent(1);
    expect(firedAfterReload.length).toBe(0);

    const persisted = JSON.parse(fs.readFileSync(persistencePath, 'utf8'));
    expect(persisted.triggeredThresholds).toContain(0.5);
    expect(persisted.triggeredThresholds).toContain(0.8);
    expect(persisted.triggeredThresholds).toContain(1.0);
  });

  it('resetSpent() persists the zero state', () => {
    const mgr = new BudgetManager({ limit: 100, persistencePath });
    mgr.recordSpent(50);
    mgr.resetSpent();
    expect(mgr.getCurrentSpent()).toBe(0);

    const raw = JSON.parse(fs.readFileSync(persistencePath, 'utf8'));
    expect(raw.spent).toBe(0);
  });

  it('auto-resets when the period has elapsed (simulated by stale lastResetAt)', () => {
    const now = Date.now();
    // Persisted state from 31 days ago, monthly period — should auto-reset.
    fs.writeFileSync(
      persistencePath,
      JSON.stringify({
        spent: 80,
        triggeredThresholds: [0.5, 0.8],
        lastResetAt: now - 31 * 24 * 60 * 60 * 1000,
      }),
      'utf8',
    );
    const mgr = new BudgetManager({
      limit: 100,
      period: 'monthly',
      persistencePath,
    });
    // Monthly period = 30 days, so a 31-day-old state should reset.
    expect(mgr.getCurrentSpent()).toBe(0);
  });

  it('does NOT auto-reset when the period has not elapsed', () => {
    const now = Date.now();
    // 1 hour old, daily period (24h) — should NOT reset.
    fs.writeFileSync(
      persistencePath,
      JSON.stringify({
        spent: 50,
        triggeredThresholds: [],
        lastResetAt: now - 1 * 60 * 60 * 1000,
      }),
      'utf8',
    );
    const mgr = new BudgetManager({
      limit: 100,
      period: 'daily',
      persistencePath,
    });
    expect(mgr.getCurrentSpent()).toBe(50);
  });

  it('works as a normal in-memory budget when persistencePath is omitted', () => {
    const mgr = new BudgetManager({ limit: 100 });
    mgr.recordSpent(40);
    expect(mgr.getCurrentSpent()).toBe(40);
    // No file should be written.
    expect(fs.existsSync(persistencePath)).toBe(false);
  });
});
