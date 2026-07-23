// Extracted from DevicesView (v0.1.5) — original JSX preserved
import type { ServerHealth } from './deviceHelpers';
import { ServerIpInfo } from './ServerIpInfo';
import { ServerConnectionString } from './ServerConnectionString';
import { ServerLanToggle } from './ServerLanToggle';

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string;
  serverStatus: 'offline' | 'listening' | 'error';
  health: ServerHealth | null;
  isStarting: boolean;
  lanEnabled: boolean;
  primaryIp: string | null;
  port: number;
  handleStartServer: () => void;
  handleStopServer: () => void;
  handleToggleLan: () => void;
  formatUptime: (s: number) => string;
};

export function ServerControlCard(props: Props) {
  const {
    t,
    serverStatus,
    health,
    isStarting,
    lanEnabled,
    primaryIp,
    port,
    handleStartServer,
    handleStopServer,
    handleToggleLan,
    formatUptime,
  } = props;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('devices.communicationServer')}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: serverStatus === 'listening' ? 'var(--success)' : 'var(--text-muted)',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: '13px',
                color: serverStatus === 'listening' ? 'var(--success)' : 'var(--text-muted)',
              }}
            >
              {serverStatus === 'listening'
                ? t('devices.statusRunning')
                : serverStatus === 'error'
                  ? t('devices.statusError')
                  : t('devices.statusOff')}
            </span>
            {health?.uptime != null && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {t('devices.uptime')} {formatUptime(health.uptime)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={serverStatus === 'listening' ? handleStopServer : handleStartServer}
          disabled={isStarting}
          style={{
            padding: '10px 24px',
            background: serverStatus === 'listening' ? 'var(--error)' : 'var(--accent-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isStarting ? 'not-allowed' : 'pointer',
            opacity: isStarting ? 0.6 : 1,
          }}
        >
          {isStarting
            ? t('devices.starting')
            : serverStatus === 'listening'
              ? t('devices.stopServer')
              : t('devices.startServer')}
        </button>
      </div>
      <ServerIpInfo
        t={t}
        serverStatus={serverStatus}
        health={health}
        primaryIp={primaryIp}
        port={port}
      />
      <ServerConnectionString t={t} serverStatus={serverStatus} primaryIp={primaryIp} port={port} />
      <ServerLanToggle t={t} lanEnabled={lanEnabled} handleToggleLan={handleToggleLan} />
    </div>
  );
}
