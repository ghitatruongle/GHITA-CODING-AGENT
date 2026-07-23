// Extracted from DevicesView (v0.1.5) — original JSX preserved
import type { ServerHealth } from './deviceHelpers';

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string;
  serverStatus: 'offline' | 'listening' | 'error';
  health: ServerHealth | null;
  codeCountdown: number;
  formatCountdown: (s: number) => string;
};

export function PairingCodeCard(props: Props) {
  const { t, serverStatus, health, codeCountdown, formatCountdown } = props;
  return (
    <>
      {/* Pairing Code */}
      {serverStatus === 'listening' && health?.pairingCode && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '16px',
            }}
          >
            {t('devices.pairingCode')}
          </h3>
          <div
            style={{
              fontSize: '36px',
              fontWeight: 700,
              letterSpacing: '8px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-primary)',
              background: 'var(--bg-tertiary)',
              padding: '16px 32px',
              borderRadius: 'var(--radius-md)',
              display: 'inline-block',
              marginBottom: '12px',
            }}
          >
            {health.pairingCode}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {t('devices.expiresAfter')} {formatCountdown(codeCountdown)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            {t('devices.pairingInstructions')}
          </div>
        </div>
      )}
    </>
  );
}
