// ==============================================================================
// GHITA CODING AGENT — Dashboard View (Phase 7B)
// ==============================================================================

import { useAppStore } from '../stores/appStore';
import { useTranslation } from '../i18n';

function StatCard({
  icon,
  title,
  value,
  subtitle,
  color,
}: {
  icon: string;
  title: string;
  value: string | number;
  subtitle?: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '28px' }}>{icon}</span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </span>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, color }}>{value}</div>
      {subtitle && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{subtitle}</div>}
    </div>
  );
}

export function DashboardView() {
  const { t } = useTranslation();
  const serverStatus = useAppStore((s) => s.serverStatus);
  const connectedDevices = useAppStore((s) => s.connectedDevices);
  const mcpServers = useAppStore((s) => s.mcpServers);
  const contextUsage = useAppStore((s) => s.contextUsage);
  const dashboardStats = useAppStore((s) => s.dashboardStats);
  const hooks = useAppStore((s) => s.hooks);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '32px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
        {t('dashboard.title')}
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px' }}>
        {t('dashboard.subtitle')}
      </p>

      {/* Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        <StatCard
          icon="📊"
          title={t('dashboard.totalTokens')}
          value={dashboardStats.totalTokens.toLocaleString()}
          subtitle={t('dashboard.contextUsed', { percent: contextUsage.percentage })}
          color="var(--accent-primary)"
        />
        <StatCard
          icon="💰"
          title={t('dashboard.totalCost')}
          value={`$${dashboardStats.totalCost.toFixed(4)}`}
          subtitle={t('dashboard.ralphLoopSession')}
          color="var(--success)"
        />
        <StatCard
          icon="🤖"
          title={t('dashboard.activeAgents')}
          value={dashboardStats.activeAgents}
          subtitle={t('dashboard.explorePlanUI')}
          color="#a78bfa"
        />
        <StatCard
          icon="🔌"
          title={t('dashboard.mcpConnections')}
          value={`${mcpServers.filter((s) => s.connected).length}/${mcpServers.length}`}
          subtitle={t('dashboard.modelContextProtocol')}
          color="#60a5fa"
        />
      </div>

      {/* Status Sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        {/* Server Status */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('dashboard.serverAndDevices')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('dashboard.socketServer')}</span>
              <span style={{ color: serverStatus === 'listening' ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                {serverStatus === 'listening' ? `● ${t('dashboard.listening')}` : serverStatus === 'error' ? `● ${t('dashboard.error')}` : `● ${t('dashboard.offline')}`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('dashboard.connectedDevices')}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{connectedDevices.length}</span>
            </div>
            {connectedDevices.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingLeft: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{d.name}</span>
                <span style={{ color: d.connected ? 'var(--success)' : 'var(--text-muted)' }}>
                  {d.connected ? '● Online' : '○ Offline'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* MCP Servers */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('dashboard.mcpServers')}
          </h3>
          {mcpServers.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('dashboard.mcpEmpty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mcpServers.map((s) => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{s.name} ({s.transport})</span>
                  <span style={{ color: s.connected ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {s.connected ? '● Connected' : s.enabled ? '○ Enabled' : '○ Disabled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hooks */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('dashboard.hooks')}
          </h3>
          {hooks.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('dashboard.hooksEmpty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {hooks.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{h.event} → {h.tool}</span>
                  <span style={{ color: h.enabled ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {h.enabled ? '● Active' : '○ Disabled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Context Usage */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('dashboard.contextWindow')}
          </h3>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('dashboard.tokenUsage')}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {contextUsage.used.toLocaleString()} / {contextUsage.max.toLocaleString()}
              </span>
            </div>
            <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, contextUsage.percentage)}%`,
                  background: contextUsage.percentage > 80 ? 'var(--error)' : contextUsage.percentage > 60 ? 'var(--warning)' : 'var(--success)',
                  borderRadius: '4px',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            {contextUsage.percentage > 80
              ? t('dashboard.contextWarning')
              : t('dashboard.contextRemaining', { percent: 100 - contextUsage.percentage })}
          </p>
        </div>
      </div>
    </div>
  );
}
