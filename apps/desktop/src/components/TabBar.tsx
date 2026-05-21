// ==============================================================================
// GHITA CODING AGENT — Tab Bar
// ==============================================================================

import { useAppStore, type TabId } from '../stores/appStore';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'code',    label: 'Code',    icon: '💻' },
  { id: 'api',     label: 'API',     icon: '🔑' },
  { id: 'skills',  label: 'Skills',  icon: '⚡' },
  { id: 'agents',  label: 'Agents',  icon: '👥' },
  { id: 'devices', label: 'Devices', icon: '📱' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'marketplace', label: 'Marketplace', icon: '🏪' },
  { id: 'workflow', label: 'Workflow', icon: '🧩' },
  { id: 'ecosystem', label: 'Ecosystem', icon: '📡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function TabBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

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
