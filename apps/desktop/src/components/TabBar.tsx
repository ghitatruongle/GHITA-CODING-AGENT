// ==============================================================================
// GHITA CODING AGENT — Tab Bar
// ==============================================================================

import { useMemo } from 'react';
import { useAppStore, type TabId } from '../stores/appStore';
import { useTranslation } from '../i18n';

export function TabBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { t } = useTranslation();

  const TABS: Array<{ id: TabId; label: string; icon: string }> = useMemo(() => [
    { id: 'code',    label: t('tabBar.code'),    icon: '💻' },
    { id: 'api',     label: t('tabBar.api'),     icon: '🔑' },
    { id: 'skills',  label: t('tabBar.skills'),  icon: '⚡' },
    { id: 'agents',  label: t('tabBar.agents'),  icon: '👥' },
    { id: 'devices', label: t('tabBar.devices'), icon: '📱' },
    { id: 'dashboard', label: t('tabBar.dashboard'), icon: '📊' },
    { id: 'marketplace', label: t('tabBar.marketplace'), icon: '🏪' },
    { id: 'workflow', label: t('tabBar.workflow'), icon: '🧩' },
    { id: 'ecosystem', label: t('tabBar.ecosystem'), icon: '📡' },
    { id: 'settings', label: t('tabBar.settings'), icon: '⚙️' },
  ], [t]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 'var(--tabbar-height)',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        paddingLeft: '8px',
        gap: '2px',
        flexShrink: 0,
        userSelect: 'none',
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={isActive}
            role="tab"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent-secondary)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-active)' : 'transparent',
              borderRadius: '8px 8px 0 0',
              borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
              transition: 'all var(--transition-fast)',
              position: 'relative',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
              if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-muted)';
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: '15px' }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}

      {/* Right side spacer + actions */}
      <div style={{ flex: 1 }} />
    </div>
  );
}
