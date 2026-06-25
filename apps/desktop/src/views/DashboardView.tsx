// ==============================================================================
// GHITA CODING AGENT — Dashboard View (Phase 7B — Tailwind Edition)
// ==============================================================================

import { useAppStore } from '../stores/appStore';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../i18n';
import { SandboxDashboard } from '../components/SandboxDashboard';
import { DocsGrillerDashboard } from '../components/DocsGrillerDashboard';
import { Badge } from '../components/ui';

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
    <div className="glass-card p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[28px]">{icon}</span>
        <span className="text-[13px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">
          {title}
        </span>
      </div>
      <div className="text-[32px] font-extrabold" style={{ color }}>
        {value}
      </div>
      {subtitle && <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>}
    </div>
  );
}

function CardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card p-6">
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  children,
  indent = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <div className={`flex justify-between text-[13px] ${indent ? 'pl-3 text-xs' : ''}`}>
      <span className="text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  );
}

export function DashboardView() {
  const { t } = useTranslation();
  const { serverStatus, connectedDevices, mcpServers, contextUsage, dashboardStats, hooks } =
    useAppStore(
      useShallow((s) => ({
        serverStatus: s.serverStatus,
        connectedDevices: s.connectedDevices,
        mcpServers: s.mcpServers,
        contextUsage: s.contextUsage,
        dashboardStats: s.dashboardStats,
        hooks: s.hooks,
      })),
    );

  const contextPercent = Math.min(100, contextUsage.percentage);
  const progressBarColor =
    contextPercent > 80
      ? 'bg-[var(--error)]'
      : contextPercent > 60
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--success)]';

  return (
    <div className="h-full overflow-auto p-8">
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
        {t('dashboard.title')}
      </h2>
      <p className="text-[var(--text-muted)] text-sm mb-8">{t('dashboard.subtitle')}</p>

      {/* Stats Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 mb-8">
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-5">
        {/* Server Status */}
        <CardSection title={t('dashboard.serverAndDevices')}>
          <div className="flex flex-col gap-2.5">
            <InfoRow label={t('dashboard.socketServer')}>
              <Badge
                variant={serverStatus === 'listening' ? 'success' : 'danger'}
                dot
              >
                {serverStatus === 'listening'
                  ? t('dashboard.listening')
                  : serverStatus === 'error'
                    ? t('dashboard.error')
                    : t('dashboard.offline')}
              </Badge>
            </InfoRow>
            <InfoRow label={t('dashboard.connectedDevices')}>
              <span className="text-[var(--text-primary)] font-semibold">
                {connectedDevices.length}
              </span>
            </InfoRow>
            {connectedDevices.map((d) => (
              <InfoRow key={d.id} label={d.name} indent>
                <span
                  className={d.connected ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}
                >
                  {d.connected ? '● Online' : '○ Offline'}
                </span>
              </InfoRow>
            ))}
          </div>
        </CardSection>

        {/* MCP Servers */}
        <CardSection title={t('dashboard.mcpServers')}>
          {mcpServers.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">{t('dashboard.mcpEmpty')}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {mcpServers.map((s) => (
                <InfoRow key={s.name} label={`${s.name} (${s.transport})`}>
                  <span
                    className={`font-semibold ${s.connected ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}
                  >
                    {s.connected ? '● Connected' : s.enabled ? '○ Enabled' : '○ Disabled'}
                  </span>
                </InfoRow>
              ))}
            </div>
          )}
        </CardSection>

        {/* Hooks */}
        <CardSection title={t('dashboard.hooks')}>
          {hooks.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">{t('dashboard.hooksEmpty')}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {hooks.map((h, i) => (
                <InfoRow key={i} label={`${h.event} → ${h.tool}`}>
                  <span
                    className={`font-semibold ${h.enabled ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}
                  >
                    {h.enabled ? '● Active' : '○ Disabled'}
                  </span>
                </InfoRow>
              ))}
            </div>
          )}
        </CardSection>

        {/* Context Usage */}
        <CardSection title={t('dashboard.contextWindow')}>
          <div className="mb-3">
            <div className="flex justify-between text-[13px] mb-2">
              <span className="text-[var(--text-muted)]">{t('dashboard.tokenUsage')}</span>
              <span className="text-[var(--text-primary)] font-semibold">
                {contextUsage.used.toLocaleString()} / {contextUsage.max.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded overflow-hidden">
              <div
                className={`h-full rounded transition-[width] duration-300 ${progressBarColor}`}
                style={{ width: `${contextPercent}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] m-0">
            {contextUsage.percentage > 80
              ? t('dashboard.contextWarning')
              : t('dashboard.contextRemaining', { percent: 100 - contextUsage.percentage })}
          </p>
        </CardSection>
      </div>

      {/* Phase 12: Docker Sandbox Dashboard */}
      <div className="mt-6">
        <SandboxDashboard />
      </div>

      {/* Phase 5: DocsGriller Dashboard */}
      <div className="mt-6">
        <DocsGrillerDashboard />
      </div>
    </div>
  );
}
