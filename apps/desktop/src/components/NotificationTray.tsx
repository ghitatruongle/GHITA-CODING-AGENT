// ==============================================================================
// Notification Tray — bell icon + dropdown panel
// ==============================================================================

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useNotifications } from '../hooks/useNotifications';

export function NotificationTray() {
  const { t } = useTranslation();
  const { items, unreadCount, markAllRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open) markAllRead();
    setOpen((v) => !v);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={t('notification.ariaLabel')}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="focus-ring"
        style={{
          position: 'relative',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          padding: '6px 8px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: '14px',
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            aria-label={t('notification.unread', { count: unreadCount })}
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              minWidth: '16px',
              height: '16px',
              padding: '0 4px',
              borderRadius: '8px',
              background: 'var(--accent-primary, #6366f1)',
              color: 'white',
              fontSize: '10px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notification.ariaLabel')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '360px',
            maxHeight: '480px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {t('notification.title')}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <p
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary, #999)',
                  fontSize: '13px',
                  margin: 0,
                }}
              >
                {t('notification.empty')}
              </p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 4,
                    }}
                  >
                    <strong style={{ fontSize: '13px' }}>{n.title}</strong>
                    <button
                      type="button"
                      onClick={() => dismiss(n.id)}
                      aria-label={t('notification.dismiss')}
                      className="focus-ring"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary, #ccc)', lineHeight: 1.4 }}>
                    {n.body}
                  </p>
                  <small style={{ color: 'var(--text-secondary, #999)', fontSize: '10px' }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </small>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
