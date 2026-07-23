// Extracted from EcosystemView
export function ApModuleCard(props: {
  t: (key: string, params?: Record<string, string | number>) => string;
  apActive: boolean;
  setApActive: (v: boolean) => void;
  apPort: number;
  setApPort: (v: number) => void;
  apRequests: Array<{ id: string; method: string; path: string; status: number; time?: string }>;
}) {
  const { t, apActive, setApActive, apPort, setApPort, apRequests } = props;
  return (
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
          {t('ecosystem.agentProtocol')}
        </span>
        <span
          style={{
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '6px',
            fontWeight: 600,
            background: apActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: apActive ? '#34d399' : '#f87171',
            border: `1px solid ${apActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {apActive ? `● ${t('ecosystem.compliant')}` : `○ ${t('ecosystem.disabledLabel')}`}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
        {t('ecosystem.agentProtocolDesc')}
      </p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {t('ecosystem.apiPort')}
          </label>
          <input
            type="number"
            value={apPort}
            onChange={(e) => setApPort(parseInt(e.target.value) || 8000)}
            disabled={apActive}
            style={{
              padding: '8px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              // ACCESSIBILITY (audit fix 1.3): removed outline:none
              opacity: apActive ? 0.6 : 1,
            }}
          />
        </div>

        <button
          onClick={() => setApActive(!apActive)}
          style={{
            alignSelf: 'flex-end',
            padding: '8px 16px',
            fontSize: '11px',
            fontWeight: 700,
            borderRadius: '6px',
            border: 'none',
            background: apActive ? '#ef4444' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)',
          }}
        >
          {apActive ? t('ecosystem.disableAp') : t('ecosystem.enableAp')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {t('ecosystem.requestsMonitor')}
        </span>
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '10px',
            height: '140px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
          className="custom-scrollbar"
        >
          {apRequests.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              {t('ecosystem.noRequestLogs')}
            </div>
          ) : (
            apRequests.map((req) => (
              <div
                key={req.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                  paddingBottom: '4px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span
                    style={{
                      color: req.method === 'POST' ? '#34d399' : '#60a5fa',
                      fontWeight: 'bold',
                      width: '40px',
                    }}
                  >
                    {req.method}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{req.path}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span
                    style={{
                      color: req.status === 200 || req.status === 201 ? '#34d399' : '#f87171',
                    }}
                  >
                    {req.status}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{req.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
