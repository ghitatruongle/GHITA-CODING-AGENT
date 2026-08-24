// v0.8.0: Removed the simulated "Demo Mode" data entirely. The gRPC / Agent
// Protocol cards previously fabricated random logs and requests; there was no
// real daemon behind them. This view now shows the *real* sidecar server status
// (from the native get_server_status command) plus the routing configuration.

import { useState } from 'react';
import { useTranslation } from '../i18n';
import { invoke } from '@tauri-apps/api/core';
import { useActivePolling } from '../hooks/useActivePolling';

import { INITIAL_ROUTER_ROUTES, type RouterRoute } from './ecosystem/routerRoutes';
import { RouterPanel } from './ecosystem/RouterPanel';

interface ServerStatus {
  status: string;
  port?: number;
  localIps?: string[];
  version?: string;
}

export function EcosystemView() {
  const { t } = useTranslation();

  // Real sidecar server status (no simulated data).
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Dynamic Router settings (UI configuration only)
  const [routerRoutes, setRouterRoutes] = useState<RouterRoute[]>(INITIAL_ROUTER_ROUTES);
  const [maxCostThreshold, setMaxCostThreshold] = useState(0.05); // USD
  const [complexityBoundary, setComplexityBoundary] = useState('automatic');

  const refreshStatus = async () => {
    try {
      const status = await invoke<ServerStatus>('get_server_status');
      setServerStatus(status);
      setServerError(null);
    } catch (e) {
      // Clear the last known-good state so the UI does not keep showing green
      // RUNNING while the sidecar has actually died.
      setServerStatus(null);
      setServerError(e instanceof Error ? e.message : String(e));
    }
  };

  // Poll real server status once on mount, then while the view is visible
  // (pauses when the window is hidden — no fake data, no background waste).
  useActivePolling(5000, refreshStatus, 'ecosystem');

  const toggleRouteStatus = (index: number) => {
    setRouterRoutes((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const nextStatus: RouterRoute['status'] =
          r.status === 'active' ? 'backup' : r.status === 'backup' ? 'disabled' : 'active';
        return { ...r, status: nextStatus };
      }),
    );
  };

  const isRunning = serverStatus?.status === 'running' || serverStatus?.status === 'ok';
  const statusLabel = isRunning
    ? t('ecosystem.running')
    : serverStatus?.status === 'starting'
      ? t('ecosystem.starting')
      : t('ecosystem.stopped');
  const statusColor = isRunning
    ? '#34d399'
    : serverStatus?.status === 'starting'
      ? '#fbbf24'
      : '#f87171';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '20px',
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(16px)',
        color: 'var(--text-primary)',
        fontFamily: 'system-ui, sans-serif',
        gap: '20px',
      }}
      className="custom-scrollbar"
    >
      <div>
        <h2
          style={{
            margin: '0 0 6px 0',
            fontSize: '18px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.5px',
          }}
        >
          {t('ecosystem.title')}
        </h2>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          {t('ecosystem.subtitle')}
        </p>
      </div>

      {/* Grid container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Real Core Server status — no simulated data */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-accent)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {t('ecosystem.coreServer')}
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 600,
                background: 'rgba(99, 102, 241, 0.15)',
                color: statusColor,
                border: `1px solid ${statusColor}55`,
              }}
            >
              ● {statusLabel}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            {serverStatus
              ? t('ecosystem.coreServerDesc', {
                  port: String(serverStatus.port ?? '—'),
                })
              : serverError
                ? t('ecosystem.coreServerError', { error: serverError })
                : t('ecosystem.coreServerChecking')}
          </p>

          {serverStatus?.localIps && serverStatus.localIps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                {t('ecosystem.localNetwork')}
              </span>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                {serverStatus.localIps.map((ip) => (
                  <span
                    key={ip}
                    style={{
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: '#a5b4fc',
                    }}
                  >
                    {ip}
                  </span>
                ))}
              </div>
            </div>
          )}

          {serverStatus?.version && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {t('ecosystem.serverVersion', { version: serverStatus.version })}
            </div>
          )}
        </div>
      </div>

      <RouterPanel
        t={t}
        routerRoutes={routerRoutes}
        maxCostThreshold={maxCostThreshold}
        setMaxCostThreshold={setMaxCostThreshold}
        complexityBoundary={complexityBoundary}
        setComplexityBoundary={setComplexityBoundary}
        toggleRouteStatus={toggleRouteStatus}
      />
    </div>
  );
}
