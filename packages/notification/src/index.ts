// ==============================================================================
// GHITA CODING AGENT - Notification Module Barrel Export (Phase 35)
// ==============================================================================

// --- Types ---
export type {
  NotificationPriority,
  NotificationChannel,
  NotificationStatus,
  Notification,
  ChannelPreference,
  NotificationPreferences,
  DndSchedule,
  ChannelDelivery,
  NotificationListener,
} from './types.js';

// --- Modules ---
export { PriorityRouter } from './priority.js';
export { ChannelRouter, InMemorySink } from './channel.js';
export type { NotificationSink } from './channel.js';
export { DndScheduler } from './dnd.js';
export { NotificationHistory } from './history.js';

export const NOTIFICATION_VERSION = '0.0.3';
