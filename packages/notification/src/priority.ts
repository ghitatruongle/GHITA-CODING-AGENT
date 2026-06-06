// ==============================================================================
// GHITA CODING AGENT - Priority & Routing (Phase 35)
// ==============================================================================

import type { Notification, NotificationPriority, NotificationChannel } from './types.js';

/** Numeric weight for priority comparison */
const PRIORITY_WEIGHT: Record<NotificationPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Default channel mapping by priority */
const DEFAULT_CHANNELS: Record<NotificationPriority, NotificationChannel[]> = {
  low: ['in-app'],
  medium: ['in-app', 'desktop'],
  high: ['in-app', 'desktop', 'mobile'],
  critical: ['in-app', 'desktop', 'mobile', 'sms', 'email'],
};

/**
 * Computes which channels a notification should go to and provides utilities
 * to compare/inspect priorities.
 */
export class PriorityRouter {
  /**
   * Resolve the channel list for a notification: starts with the caller's list,
   * then falls back to defaults by priority if empty.
   */
  resolveChannels(n: Pick<Notification, 'priority' | 'channels'>): NotificationChannel[] {
    if (n.channels.length > 0) return n.channels;
    return [...DEFAULT_CHANNELS[n.priority]];
  }

  /**
   * Filter a channel list against the user's per-channel min-priority preferences.
   */
  filterByPreferences(channels: NotificationChannel[], priority: NotificationPriority, prefs: Array<{ channel: NotificationChannel; minPriority: NotificationPriority; enabled: boolean }>): NotificationChannel[] {
    return channels.filter((c) => {
      const p = prefs.find((x) => x.channel === c);
      if (!p) return true;
      if (!p.enabled) return false;
      return PRIORITY_WEIGHT[priority] >= PRIORITY_WEIGHT[p.minPriority];
    });
  }

  /**
   * Numeric comparison of two priorities. Returns -1, 0, 1.
   */
  compare(a: NotificationPriority, b: NotificationPriority): -1 | 0 | 1 {
    if (PRIORITY_WEIGHT[a] < PRIORITY_WEIGHT[b]) return -1;
    if (PRIORITY_WEIGHT[a] > PRIORITY_WEIGHT[b]) return 1;
    return 0;
  }

  /**
   * Whether priority is at-or-above threshold.
   */
  meetsThreshold(p: NotificationPriority, threshold: NotificationPriority): boolean {
    return PRIORITY_WEIGHT[p] >= PRIORITY_WEIGHT[threshold];
  }

  /**
   * Sort notifications high → low priority.
   */
  sort(notifications: Notification[]): Notification[] {
    return [...notifications].sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
  }

  /** Default channel map (for documentation / UI) */
  static get defaultChannels(): typeof DEFAULT_CHANNELS {
    return DEFAULT_CHANNELS;
  }
}
