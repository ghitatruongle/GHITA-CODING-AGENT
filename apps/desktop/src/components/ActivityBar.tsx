// ==============================================================================
// GHITA CODING AGENT — Activity Bar
// VS Code-inspired left-side icon-based navigation bar
// ==============================================================================

import { useMemo } from 'react';
import { useAppStore, type TabId } from '../stores/appStore';
import { useTranslation } from '../i18n';

interface ActivityItem {
  id: string;
  icon: React.ReactNode;
  tooltip: string;
}

export function ActivityBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { t } = useTranslation();

  // Map activity bar items to their effective TabId for isActive highlighting
  const ACTIVITY_TAB_MAP: Record<string, string> = {
    code: 'code',
    search: 'code', // search opens command palette within code context
    'source-control': 'workflow',
    debug: 'monitoring',
    extensions: 'marketplace',
    settings: 'settings',
  };

  const items: ActivityItem[] = useMemo(
    () => [
      {
        id: 'code',
        icon: <span className="text-lg">💻</span>,
        tooltip: t('activityBar.code') || 'Code',
      },
      {
        id: 'search',
        icon: <span className="text-lg">🔍</span>,
        tooltip: t('activityBar.search') || 'Search',
      },
      {
        id: 'source-control',
        icon: <span className="text-lg">🔀</span>,
        tooltip: t('activityBar.sourceControl') || 'SCM',
      },
      {
        id: 'debug',
        icon: <span className="text-lg">🐛</span>,
        tooltip: t('activityBar.debug') || 'Run & Debug',
      },
      {
        id: 'extensions',
        icon: <span className="text-lg">📦</span>,
        tooltip: t('activityBar.extensions') || 'Extensions',
      },
      {
        id: 'settings',
        icon: <span className="text-lg">⚙️</span>,
        tooltip: t('activityBar.settings') || 'Settings',
      },
    ],
    [t],
  );

  const handleClick = (id: string) => {
    if (id === 'search') {
      useAppStore.getState().setCommandPaletteOpen(true);
      return;
    }
    if (id === 'source-control' || id === 'debug' || id === 'extensions') {
      const map: Record<string, TabId> = {
        'source-control': 'workflow',
        debug: 'monitoring',
        extensions: 'marketplace',
      };
      setActiveTab(map[id] || 'settings');
      return;
    }
    setActiveTab(id as TabId);
  };

  return (
    <div
      className="flex flex-col items-center py-2 px-1 bg-bg-secondary border-r border-border-subtle shrink-0"
      style={{ width: '48px' }}
      role="navigation"
      aria-label={t('activityBar.label') || 'Activity Bar'}
    >
      {items.map((item) => {
        const effectiveTab = ACTIVITY_TAB_MAP[item.id] || item.id;
        const isActive = activeTab === effectiveTab;
        return (
          <button
            key={item.id}
            onClick={() => handleClick(item.id)}
            title={item.tooltip}
            aria-label={item.tooltip}
            aria-selected={isActive}
            role="tab"
            className="relative w-10 h-10 flex items-center justify-center rounded-md transition-colors"
            style={{
              color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--bg-active)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            {item.icon}
            {isActive && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full"
                style={{ background: 'var(--accent-primary)' }}
              />
            )}
          </button>
        );
      })}

      {/* Bottom spacer — keeps account/avatar area at the bottom like VS Code */}
      <div className="mt-auto pt-2" />
    </div>
  );
}
