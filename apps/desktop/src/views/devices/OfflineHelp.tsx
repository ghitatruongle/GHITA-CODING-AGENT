// Extracted from DevicesView (v0.1.5) — original JSX preserved
import { ConnectionGuide } from '../../components/ConnectionGuide';
import type { ServerHealth } from './deviceHelpers';

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string;
  serverStatus: 'offline' | 'listening' | 'error';
  health: ServerHealth | null;
};

export function OfflineHelp(props: Props) {
  const { t, serverStatus, health } = props;
  return (
    <>
      {/* Bluetooth Connection Guide */}
      {serverStatus === 'listening' && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '22px' }}>🔵</span>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('devices.bluetoothConnection')}
            </h3>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <p style={{ marginBottom: '8px' }}>{t('devices.bluetoothGuide')}</p>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-primary)',
                background: 'var(--bg-tertiary)',
                padding: '12px 20px',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                marginBottom: '12px',
                letterSpacing: '2px',
                wordBreak: 'break-all',
              }}
            >
              {health?.hostname || 'DESKTOP'}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {t('devices.bluetoothHint')}
            </p>
          </div>
        </div>
      )}
      {/* Instructions when server is off */}
      {serverStatus !== 'listening' && <ConnectionGuide />}
    </>
  );
}
