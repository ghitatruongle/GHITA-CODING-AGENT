// Extracted section from ServerControlCard
export function ServerConnectionString(props: {
  t: (key: string, params?: Record<string, string | number>) => string;
  serverStatus: 'offline' | 'listening' | 'error';
  primaryIp: string | null;
  port: number;
}) {
  const { t, serverStatus, primaryIp, port } = props;
  return (
    <>
      {/* Connection string */}
      {serverStatus === 'listening' && primaryIp && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
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
              {t('devices.connectionAddress')}
            </div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--accent-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              http://{primaryIp}:{port}
            </div>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(`http://${primaryIp}:${port}`)}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-active)',
              color: 'var(--accent-primary)',
              border: '1px solid rgba(129,140,248,0.2)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t('common.copy')}
          </button>
        </div>
      )}
    </>
  );
}
