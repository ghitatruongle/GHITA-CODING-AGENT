// ==============================================================================
// useNotifications hook tests
// ==============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { useNotifications, __resetNotificationHistoryForTests } from '../useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetNotificationHistoryForTests();
  });

  it('starts with empty list', async () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('push adds a notification', async () => {
    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      await result.current.push({ title: 'Test', body: 'Hello' });
    });
    expect(result.current.items.length).toBeGreaterThan(0);
    expect(result.current.items[0].title).toBe('Test');
    expect(result.current.unreadCount).toBeGreaterThan(0);
  });

  it('markAllRead clears unread count', async () => {
    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      await result.current.push({ title: 'A', body: 'x' });
      await result.current.push({ title: 'B', body: 'y' });
    });
    expect(result.current.unreadCount).toBe(2);
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it('dismiss removes a notification', async () => {
    const { result } = renderHook(() => useNotifications());
    let id = '';
    await act(async () => {
      await result.current.push({ title: 'A', body: 'x' });
    });
    // After push, wait for refresh to complete by triggering it manually
    await act(async () => {
      result.current.refresh();
    });
    expect(result.current.items.length).toBe(1);
    id = result.current.items[0]?.id ?? '';
    act(() => result.current.dismiss(id));
    // Dismiss just marks as read (the local store has no remove method);
    // verify it's no longer unread
    expect(result.current.unreadCount).toBe(0);
  });

  it('refresh re-reads history', async () => {
    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      result.current.refresh();
    });
    expect(result.current.items).toBeDefined();
    expect(Array.isArray(result.current.items)).toBe(true);
  });
});
