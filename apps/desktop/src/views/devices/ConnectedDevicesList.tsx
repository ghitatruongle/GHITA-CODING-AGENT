// Extracted from DevicesView (v0.1.5) — original JSX preserved
import type { ServerHealth } from './deviceHelpers';

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string;
  health: ServerHealth | null;
  handleUnpairDevice: (deviceId: string) => void;
};

export function ConnectedDevicesList(props: Props) {
  const { t, health, handleUnpairDevice } = props;
  return (
    <>
      {/* Connected Devices */}
      {health?.devices && health.devices.length > 0 && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('devices.connectedDevices')}
            </h3>
          </div>
          {health.devices.map((device, index) => (
            <div
              key={`${device.id}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '20px' }}>
                {device.platform === 'android' ? '📱' : '💻'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {device.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {device.platform} - {t('devices.lastSeen')}{' '}
                  {new Date(device.lastSeen).toLocaleTimeString()}
                </div>
              </div>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: device.connected ? 'var(--success)' : 'var(--text-muted)',
                }}
              />
              <button
                onClick={() => handleUnpairDevice(device.id)}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#ef4444',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginLeft: '12px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                }}
              >
                {t('devices.unpair')}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
