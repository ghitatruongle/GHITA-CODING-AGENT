// ==============================================================================
// GHITA CODING AGENT - Notification History (Phase 35)
// ==============================================================================

import type { Notification, NotificationStatus } from './types.js';

/**
 * Append-only history of notifications with query helpers.
 * Bounded by maxSize; oldest entries are evicted when the cap is reached.
 */
export class NotificationHistory {
  private store: Notification[] = [];
  constructor(private maxSize = 5000) {}

  /**
   * Add a notification to history.
   */
  add(n: Notification): void {
    this.store.push(n);
    if (this.store.length > this.maxSize) this.store.splice(0, this.store.length - this.maxSize);
  }

  /**
   * Mark as read.
   */
  markRead(id: string, at: number = Date.now()): boolean {
    const n = this.store.find((x) => x.id === id);
    if (!n) return false;
    n.readAt = at;
    if (n.status === 'delivered') n.status = 'read';
    return true;
  }

  /**
   * Remove a notification by id. Returns true if removed.
   */
  remove(id: string): boolean {
    const idx = this.store.findIndex((x) => x.id === id);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }

  /**
   * List for a user, newest first.
   */
  listForUser(userId: string, limit = 100): Notification[] {
    return this.store
      .filter((n) => n.userId === userId)
      .reverse()
      .slice(0, limit);
  }

  /**
   * Count unread for a user.
   */
  unreadCount(userId: string): number {
    return this.store.filter(
      (n) => n.userId === userId && n.status !== 'read' && n.status !== 'failed',
    ).length;
  }

  /**
   * Filter by status.
   */
  byStatus(userId: string, status: NotificationStatus): Notification[] {
    return this.store.filter((n) => n.userId === userId && n.status === status);
  }

  /**
   * Filter by category.
   */
  byCategory(userId: string, category: string): Notification[] {
    return this.store.filter((n) => n.userId === userId && n.category === category);
  }

  /**
   * Clear all history (e.g. user-initiated reset).
   */
  clear(userId?: string): number {
    if (!userId) {
      const n = this.store.length;
      this.store = [];
      return n;
    }
    const before = this.store.length;
    this.store = this.store.filter((n) => n.userId !== userId);
    return before - this.store.length;
  }

  /**
   * Total stored.
   */
  get size(): number {
    return this.store.length;
  }
}
