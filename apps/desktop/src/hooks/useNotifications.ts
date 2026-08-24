// Notification hook — bridges NotificationHistory with React UI

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  NotificationHistory,
  type Notification,
} from '../../../../packages/notification/src/index.js';

const USER_ID = 'local';
let _history: NotificationHistory | null = null;
function getHistory(): NotificationHistory {
  if (!_history) _history = new NotificationHistory(500);
  return _history;
}

// Test-only helper — do not call from production code.
export function __resetNotificationHistoryForTests() {
  _history = null;
}

export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([]);

  const refresh = useCallback(() => {
    setItems(getHistory().listForUser(USER_ID, 50));
  }, []);

  useEffect(() => {
    refresh();
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refresh();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refresh();
      }
    }, 15_000);
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [refresh]);

  // C3: make unreadCount reactive to items
  const unreadCount = useMemo(
    () => items.filter((n) => n.status !== 'read' && n.status !== 'failed').length,
    [items],
  );

  const markAllRead = useCallback(() => {
    const list = getHistory().listForUser(USER_ID, 500);
    for (const n of list) {
      if (n.status !== 'read') getHistory().markRead(n.id);
    }
    refresh();
  }, [refresh]);

  // C2: real dismiss — add + remove from history
  const dismiss = useCallback(
    (id: string) => {
      getHistory().remove(id);
      refresh();
    },
    [refresh],
  );

  // C1: removed OS-level notification invoke (in-app tray is the contract)
  const push = useCallback(
    (notification: {
      title: string;
      body: string;
      category?: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      userId?: string;
    }) => {
      const note: Notification = {
        id: crypto.randomUUID(),
        userId: notification.userId ?? USER_ID,
        title: notification.title,
        body: notification.body,
        category: notification.category ?? 'general',
        priority: notification.priority ?? 'medium',
        channels: ['in-app'],
        createdAt: Date.now(),
        status: 'delivered',
      };
      getHistory().add(note);
      refresh();
    },
    [refresh],
  );

  return { items, unreadCount, markAllRead, dismiss, push, refresh };
}
