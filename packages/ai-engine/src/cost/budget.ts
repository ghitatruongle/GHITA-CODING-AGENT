import { AIBudgetExceededError } from '../errors/index.js';

// ------------------------------------------------------------------------------
// Budget Manager
// ------------------------------------------------------------------------------
export interface BudgetOptions {
  limit: number;
  period?: 'daily' | 'weekly' | 'monthly';
  onAlert?: (spent: number, limit: number, percentage: number) => void;
  alertThresholds?: number[]; // e.g. [0.8, 1.0] representing 80% and 100%
}

export class BudgetManager {
  private spent = 0;
  private limit: number;
  private period: string;
  private onAlert?: (spent: number, limit: number, percentage: number) => void;
  private alertThresholds: number[];
  private triggeredThresholds = new Set<number>();

  constructor(options: BudgetOptions) {
    this.limit = options.limit;
    this.period = options.period || 'monthly';
    this.onAlert = options.onAlert;
    this.alertThresholds = options.alertThresholds || [0.8, 1.0];
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
  }

  resetSpent(): void {
    this.spent = 0;
    this.resetTriggeredThresholds();
  }

  private resetTriggeredThresholds(): void {
    this.triggeredThresholds.clear();
  }
}
