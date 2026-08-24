import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationHistory } from './history.js';
import type { Notification } from './types.js';

function makeNotif(overrides: Partial<Notification> & { id: string }): Notification {
  return {
    userId: 'user1',
    title: 'Test',
    body: 'Test notification',
    priority: 'medium',
    channels: ['in-app'],
    status: 'delivered',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('NotificationHistory', () => {
  let history: NotificationHistory;

  beforeEach(() => {
    history = new NotificationHistory();
  });

  it('should start empty', () => {
    expect(history.unreadCount('user1')).toBe(0);
  });

  it('should add notifications', () => {
    history.add(makeNotif({ id: 'n1' }));
    const list = history.listForUser('user1');
    expect(list).toHaveLength(1);
  });

  it('should enforce max size limit', () => {
    const small = new NotificationHistory(3);
    small.add(makeNotif({ id: 'n1' }));
    small.add(makeNotif({ id: 'n2' }));
    small.add(makeNotif({ id: 'n3' }));
    small.add(makeNotif({ id: 'n4' }));
    expect(small.size).toBe(3);
  });

  it('should mark notifications as read (status: delivered → read)', () => {
    history.add(makeNotif({ id: 'n1', status: 'delivered' }));
    const result = history.markRead('n1');
    expect(result).toBe(true);
    const list = history.listForUser('user1');
    const notif = list.find((n) => n.id === 'n1');
    expect(notif?.status).toBe('read');
    expect(notif?.readAt).toBeGreaterThan(0);
  });

  it('should count unread notifications', () => {
    history.add(makeNotif({ id: 'n1', status: 'delivered' }));
    history.add(makeNotif({ id: 'n2', status: 'delivered' }));
    history.markRead('n1');
    const unread = history.unreadCount('user1');
    expect(unread).toBe(1);
  });

  it('should filter by status', () => {
    history.add(makeNotif({ id: 'n1', status: 'delivered' }));
    history.markRead('n1');
    history.add(makeNotif({ id: 'n2', status: 'delivered' }));
    const read = history.byStatus('user1', 'read');
    expect(read).toHaveLength(1);
    const delivered = history.byStatus('user1', 'delivered');
    expect(delivered).toHaveLength(1);
  });

  it('should filter by category', () => {
    history.add(makeNotif({ id: 'n1', category: 'alert' }));
    history.add(makeNotif({ id: 'n2', category: 'info' }));
    const alerts = history.byCategory('user1', 'alert');
    expect(alerts).toHaveLength(1);
  });

  it('should clear all notifications for a user', () => {
    history.add(makeNotif({ id: 'n1', userId: 'user1' }));
    history.add(makeNotif({ id: 'n2', userId: 'user2' }));
    const removed = history.clear('user1');
    expect(removed).toBe(1);
    expect(history.listForUser('user1')).toHaveLength(0);
    expect(history.listForUser('user2')).toHaveLength(1);
  });

  it('should clear all notifications', () => {
    history.add(makeNotif({ id: 'n1', userId: 'user1' }));
    history.add(makeNotif({ id: 'n2', userId: 'user2' }));
    history.clear();
    expect(history.size).toBe(0);
  });
});
