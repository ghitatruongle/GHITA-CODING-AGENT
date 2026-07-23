// Extracted section from ServerControlCard
import type { ServerHealth } from './deviceHelpers';

export function ServerIpInfo(props: {
  t: (key: string, params?: Record<string, string | number>) => string;
  serverStatus: 'offline' | 'listening' | 'error';
  health: ServerHealth | null;
  primaryIp: string | null;
  port: number;
}) {
  const { t, serverStatus, health, primaryIp, port } = props;
  return (
    <>
      {/* IP + Port info */}
      {serverStatus === 'listening' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            padding: '16px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}
            >
              {t('devices.ipAddress')}
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {primaryIp || t('devices.searching')}
            </div>
            {health?.localIps && health.localIps.length > 1 && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                  wordBreak: 'break-all',
                }}
              >
                {t('devices.otherIps')} {health.localIps.slice(1).join(', ')}
              </div>
            )}
          </div>
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}
            >
              {t('devices.port')}
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {port}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}
            >
              {t('devices.hostname')}
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
              }}
            >
              {health?.hostname || 'DESKTOP'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
