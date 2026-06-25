// ==============================================================================
// GHITA CODING AGENT - Payout Scheduler (Phase 38)
// ==============================================================================

import { randomUUID } from 'node:crypto';
import type { Payout, PayoutSchedule } from './types.js';

/**
 * Schedules and marks payouts as ready when their threshold + cadence is met.
 * Pure in-memory scheduling; production would integrate with a queue / worker.
 */
export class PayoutScheduler {
  private schedules = new Map<string, PayoutSchedule>();
  private pending: Payout[] = [];

  /**
   * Register or replace a payout schedule for a recipient.
   */
  upsertSchedule(
    schedule: Omit<PayoutSchedule, 'id' | 'nextRun'> & { id?: string },
  ): PayoutSchedule {
    const id = schedule.id ?? randomUUID();
    const nextRun = this.computeNextRun(schedule.cadence, schedule.dayOfMonth);
    const full: PayoutSchedule = { ...schedule, id, nextRun };
    this.schedules.set(id, full);
    return full;
  }

  /**
   * Queue a payout for processing.
   */
  enqueue(payout: Payout): void {
    this.pending.push(payout);
  }

  /**
   * Mark payouts ready for a given recipient (those above threshold for their schedule).
   */
  readyForRecipient(recipientId: string): Payout[] {
    const sched = Array.from(this.schedules.values()).find(
      (s) => s.recipientId === recipientId && s.active,
    );
    if (!sched) return [];

    const matching = this.pending.filter(
      (p) => p.recipientId === recipientId && p.status === 'pending',
    );
    const total = matching.reduce((acc, p) => acc + p.amount, 0);
    if (total < sched.threshold) return [];

    for (const p of matching) {
      p.status = 'scheduled';
      p.scheduledFor = sched.nextRun;
    }

    return matching;
  }

  /**
   * Process due schedules: returns payouts marked paid for schedules whose nextRun <= now.
   */
  processDue(now: number = Date.now()): Payout[] {
    const paid: Payout[] = [];
    for (const sched of this.schedules.values()) {
      if (!sched.active) continue;
      if (sched.nextRun > now) continue;
      const due = this.pending.filter(
        (p) => p.recipientId === sched.recipientId && p.status === 'scheduled',
      );
      for (const p of due) {
        p.status = 'paid';
        p.paidAt = now;
        paid.push(p);
      }
      // Advance the schedule
      sched.nextRun = this.computeNextRun(sched.cadence, sched.dayOfMonth, now);
    }
    return paid;
  }

  /**
   * List all schedules.
   */
  listSchedules(): PayoutSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * List all pending payouts.
   */
  listPending(): Payout[] {
    return [...this.pending];
  }

  private computeNextRun(
    cadence: PayoutSchedule['cadence'],
    dayOfMonth?: number,
    from: number = Date.now(),
  ): number {
    const d = new Date(from);
    switch (cadence) {
      case 'daily':
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      case 'weekly':
        d.setDate(d.getDate() + 7);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      case 'biweekly':
        d.setDate(d.getDate() + 14);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        if (dayOfMonth) d.setDate(Math.min(dayOfMonth, 28));
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      case 'quarterly':
        d.setMonth(d.getMonth() + 3);
        if (dayOfMonth) d.setDate(Math.min(dayOfMonth, 28));
        d.setHours(9, 0, 0, 0);
        return d.getTime();
    }
  }
}
