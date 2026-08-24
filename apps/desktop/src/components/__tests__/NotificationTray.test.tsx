// NotificationTray component tests (smoke tests)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

interface MockReturn {
  items: unknown[];
  unreadCount: number;
  markAllRead: () => void;
  dismiss: () => void;
  push: () => void;
  refresh: () => void;
}

let mockReturn: MockReturn = {
  items: [],
  unreadCount: 0,
  markAllRead: vi.fn(),
  dismiss: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => mockReturn,
}));

vi.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const map: Record<string, string> = {
        'notification.ariaLabel': 'Notifications',
        'notification.title': 'Notifications',
        'notification.empty': 'No notifications',
      };
      return map[key] ?? fallback ?? key;
    },
    lang: 'en',
  }),
}));

import { NotificationTray } from '../NotificationTray';

describe('NotificationTray smoke tests', () => {
  beforeEach(() => {
    mockReturn = {
      items: [],
      unreadCount: 0,
      markAllRead: vi.fn(),
      dismiss: vi.fn(),
      push: vi.fn(),
      refresh: vi.fn(),
    };
  });

  it('renders without crashing', () => {
    const { container } = render(<NotificationTray />);
    expect(container.querySelector('button')).toBeTruthy();
  });

  it('renders bell button with aria-expanded=false', () => {
    const { container } = render(<NotificationTray />);
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders unread badge when count > 0', () => {
    mockReturn = { ...mockReturn, unreadCount: 5 };
    const { container } = render(<NotificationTray />);
    expect(container.textContent).toContain('5');
  });
});
