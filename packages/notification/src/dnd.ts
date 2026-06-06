// ==============================================================================
// GHITA CODING AGENT - Do-Not-Disturb Scheduler (Phase 35)
// ==============================================================================

import { randomUUID } from 'node:crypto';
import type { DndSchedule, NotificationPreferences } from './types.js';

/**
 * Tracks recurring DND windows per user and exposes a synchronous
 * "is DND active right now?" check used by the channel router.
 */
export class DndScheduler {
  private schedules = new Map<string, DndSchedule[]>();

  /**
   * Add a DND schedule for a user.
   */
  addSchedule(s: Omit<DndSchedule, 'id'> & { id?: string }): DndSchedule {
    const id = s.id ?? randomUUID();
    const full: DndSchedule = { ...s, id };
    const list = this.schedules.get(s.userId) ?? [];
    list.push(full);
    this.schedules.set(s.userId, list);
    return full;
  }

  /**
   * Remove a schedule by id.
   */
  remove(scheduleId: string): boolean {
    for (const [userId, list] of this.schedules) {
      const before = list.length;
      const next = list.filter((s) => s.id !== scheduleId);
      if (next.length !== before) {
        this.schedules.set(userId, next);
        return true;
      }
    }
    return false;
  }

  /**
   * Toggle a schedule on/off.
   */
  setActive(scheduleId: string, active: boolean): boolean {
    for (const list of this.schedules.values()) {
      const s = list.find((x) => x.id === scheduleId);
      if (s) {
        s.active = active;
        return true;
      }
    }
    return false;
  }

  /**
   * Compute whether DND is active for a user at a given instant.
   */
  isActive(userId: string, now: Date = new Date()): boolean {
    const list = this.schedules.get(userId) ?? [];
    for (const s of list) {
      if (!s.active) continue;
      if (!s.days.includes(now.getDay())) continue;
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (s.startMinutes === s.endMinutes) continue;
      if (s.startMinutes < s.endMinutes) {
        if (minutes >= s.startMinutes && minutes < s.endMinutes) return true;
      } else {
        if (minutes >= s.startMinutes || minutes < s.endMinutes) return true;
      }
    }
    return false;
  }

  /**
   * Augment a user's NotificationPreferences with the live DND flag.
   */
  withLiveDnd(prefs: NotificationPreferences, now: Date = new Date()): NotificationPreferences {
    return { ...prefs, dndActive: prefs.dndActive || this.isActive(prefs.userId, now) };
  }

  listForUser(userId: string): DndSchedule[] {
    return [...(this.schedules.get(userId) ?? [])];
  }
}
