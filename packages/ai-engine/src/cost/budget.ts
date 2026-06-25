import { AIBudgetExceededError } from '../errors/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ------------------------------------------------------------------------------
// Budget Manager
// ------------------------------------------------------------------------------
export interface BudgetOptions {
  limit: number;
  period?: 'daily' | 'weekly' | 'monthly';
  onAlert?: (spent: number, limit: number, percentage: number) => void;
  alertThresholds?: number[]; // e.g. [0.8, 1.0] representing 80% and 100%
  /** Optional file path for persistent budget storage. When set, the
   *  budget state is saved to disk after each `recordSpent` call and
   *  restored on construction. This prevents the budget from resetting
   *  to zero when the application restarts (audit fix 2.9). */
  persistencePath?: string;
}

interface PersistedBudgetState {
  spent: number;
  triggeredThresholds: number[];
  lastResetAt: number;
}

export class BudgetManager {
  private spent = 0;
  private limit: number;
  private period: string;
  private onAlert?: (spent: number, limit: number, percentage: number) => void;
  private alertThresholds: number[];
  private triggeredThresholds = new Set<number>();
  private readonly persistencePath?: string;
  private lastResetAt = Date.now();

  constructor(options: BudgetOptions) {
    this.limit = options.limit;
    this.period = options.period || 'monthly';
    this.onAlert = options.onAlert;
    this.alertThresholds = options.alertThresholds || [0.8, 1.0];
    this.persistencePath = options.persistencePath;

    // PERSISTENCE (audit fix 2.9): restore budget state from disk if
    // a persistence path is configured. This ensures the spent amount
    // survives application restarts.
    if (this.persistencePath) {
      this.loadFromDisk();
      this.checkAutoReset();
    }
  }

  getLimit(): number {
    return this.limit;
  }

  setLimit(limit: number): void {
    this.limit = limit;
    this.resetTriggeredThresholds();
  }

  getCurrentSpent(): number {
    return this.spent;
  }

  checkBudget(estimatedNewCost = 0): void {
    if (this.spent + estimatedNewCost > this.limit) {
      throw new AIBudgetExceededError(this.limit, this.spent + estimatedNewCost, this.period);
    }
  }

  recordSpent(amount: number): void {
    const newSpent = this.spent + amount;
    this.spent = newSpent;

    if (this.onAlert && this.limit > 0) {
      const percentage = newSpent / this.limit;
      for (const threshold of this.alertThresholds) {
        if (percentage >= threshold && !this.triggeredThresholds.has(threshold)) {
          this.triggeredThresholds.add(threshold);
          try {
            this.onAlert(newSpent, this.limit, percentage);
          } catch (err) {
            console.warn(
              '[BudgetManager] Alert callback failed:',
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      }
    }

    // Persist after each spend (audit fix 2.9)
    if (this.persistencePath) {
      this.saveToDisk();
    }
  }

  resetSpent(): void {
    this.spent = 0;
    this.lastResetAt = Date.now();
    this.resetTriggeredThresholds();
    if (this.persistencePath) {
      this.saveToDisk();
    }
  }

  private resetTriggeredThresholds(): void {
    this.triggeredThresholds.clear();
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers (audit fix 2.9)
  // ---------------------------------------------------------------------------

  private saveToDisk(): void {
    try {
      if (!this.persistencePath) return;
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const state: PersistedBudgetState = {
        spent: this.spent,
        triggeredThresholds: [...this.triggeredThresholds],
        lastResetAt: this.lastResetAt,
      };
      fs.writeFileSync(this.persistencePath, JSON.stringify(state), 'utf8');
    } catch {
      // Non-critical — budget still works in-memory
    }
  }

  private loadFromDisk(): void {
    try {
      if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
      const raw = fs.readFileSync(this.persistencePath, 'utf8');
      const state = JSON.parse(raw) as PersistedBudgetState;
      if (typeof state.spent === 'number' && state.spent >= 0) {
        this.spent = state.spent;
      }
      if (Array.isArray(state.triggeredThresholds)) {
        this.triggeredThresholds = new Set(state.triggeredThresholds);
      }
      if (typeof state.lastResetAt === 'number') {
        this.lastResetAt = state.lastResetAt;
      }
    } catch {
      // Corrupt file — start fresh
    }
  }

  /** Auto-reset budget when the period elapses. */
  private checkAutoReset(): void {
    const now = Date.now();
    const periodMs = this.getPeriodMs();
    if (periodMs > 0 && now - this.lastResetAt > periodMs) {
      this.spent = 0;
      this.lastResetAt = now;
      this.triggeredThresholds.clear();
      this.saveToDisk();
    }
  }

  private getPeriodMs(): number {
    switch (this.period) {
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  }
}
