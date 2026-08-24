/** Priority levels */
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

/** Delivery channels */
export type NotificationChannel = 'desktop' | 'mobile' | 'email' | 'sms' | 'webhook' | 'in-app';

/** Notification status */
export type NotificationStatus = 'queued' | 'delivered' | 'failed' | 'suppressed' | 'read';

/** A notification */
export interface Notification {
  id: string;
  /** User recipient */
  userId: string;
  /** Title */
  title: string;
  /** Body */
  body: string;
  /** Priority */
  priority: NotificationPriority;
  /** Channels to deliver to (resolved at send time) */
  channels: NotificationChannel[];
  /** Category / grouping key */
  category?: string;
  /** Optional actions (e.g. "View", "Dismiss") */
  actions?: Array<{ id: string; label: string; url?: string }>;
  /** Arbitrary metadata */
  meta?: Record<string, string | number | boolean>;
  /** Created timestamp */
  createdAt: number;
  /** Delivered timestamp */
  deliveredAt?: number;
  /** Read timestamp */
  readAt?: number;
  /** Current status */
  status: NotificationStatus;
  /** Failure reason */
  failureReason?: string;
}

/** Per-channel preference */
export interface ChannelPreference {
  channel: NotificationChannel;
  enabled: boolean;
  /** Minimum priority that should be delivered on this channel */
  minPriority: NotificationPriority;
}

/** Per-user notification preferences */
export interface NotificationPreferences {
  userId: string;
  channels: ChannelPreference[];
  /** Global do-not-disturb (computed by DND scheduler) */
  dndActive: boolean;
  /** Daily digest instead of real-time */
  digest: boolean;
  /** Quiet hours start (0-23) */
  quietHoursStart?: number;
  /** Quiet hours end (0-23) */
  quietHoursEnd?: number;
}

/** DND schedule entry */
export interface DndSchedule {
  id: string;
  userId: string;
  /** Days of week (0=Sun, 6=Sat) */
  days: number[];
  /** Start time in minutes from midnight */
  startMinutes: number;
  /** End time in minutes from midnight */
  endMinutes: number;
  /** Timezone (IANA, e.g. "Asia/Ho_Chi_Minh") */
  timezone: string;
  /** Whether active */
  active: boolean;
}

/** Delivery result per channel */
export interface ChannelDelivery {
  channel: NotificationChannel;
  success: boolean;
  deliveredAt?: number;
  error?: string;
}

export type NotificationListener = (n: Notification) => void;
