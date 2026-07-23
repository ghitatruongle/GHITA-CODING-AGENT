// Extracted section from ServerControlCard
export function ServerLanToggle(props: {
  t: (key: string, params?: Record<string, string | number>) => string;
  lanEnabled: boolean;
  handleToggleLan: () => void;
}) {
  const { t, lanEnabled, handleToggleLan } = props;
  return (
    <>
      {/* Toggle LAN */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 0',
          borderTop: '1px solid var(--border-subtle)',
          marginTop: '16px',
        }}
      >
        <div style={{ marginRight: '16px' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
            {t('devices.lanEnabled')}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginTop: '2px',
              lineHeight: '1.4',
            }}
          >
            {t('devices.lanEnabledDesc')}
          </div>
        </div>
        <label
          style={{
            position: 'relative',
            display: 'inline-block',
            width: '44px',
            height: '22px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <input
            type="checkbox"
            checked={lanEnabled}
            onChange={handleToggleLan}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: lanEnabled ? 'var(--accent-primary)' : '#475569',
              borderRadius: '22px',
              transition: '0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                content: '""',
                height: '16px',
                width: '16px',
                left: lanEnabled ? '24px' : '4px',
                bottom: '3px',
                backgroundColor: 'white',
                borderRadius: '50%',
                transition: '0.2s',
              }}
            />
          </span>
        </label>
      </div>
    </>
  );
}
