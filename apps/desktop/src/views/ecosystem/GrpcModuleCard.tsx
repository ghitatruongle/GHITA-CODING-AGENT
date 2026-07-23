// Extracted from EcosystemView
export function GrpcModuleCard(props: {
  t: (key: string, params?: Record<string, string | number>) => string;
  grpcActive: boolean;
  setGrpcActive: (v: boolean) => void;
  grpcPort: number;
  setGrpcPort: (v: number) => void;
  grpcLogs: string[];
  setGrpcLogs: (updater: (prev: string[]) => string[]) => void;
}) {
  const { t, grpcActive, setGrpcActive, grpcPort, setGrpcPort, grpcLogs, setGrpcLogs } = props;
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
          {t('ecosystem.grpcDaemon')}
        </span>
        <span
          style={{
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '6px',
            fontWeight: 600,
            background: grpcActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: grpcActive ? '#34d399' : '#f87171',
            border: `1px solid ${grpcActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {grpcActive ? `● ${t('ecosystem.running')}` : `○ ${t('ecosystem.stopped')}`}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
        {t('ecosystem.grpcDesc')}
      </p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {t('ecosystem.serverPort')}
          </label>
          <input
            type="number"
            value={grpcPort}
            onChange={(e) => setGrpcPort(parseInt(e.target.value) || 50051)}
            disabled={grpcActive}
            style={{
              padding: '8px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              // ACCESSIBILITY (audit fix 1.3): removed outline:none
              opacity: grpcActive ? 0.6 : 1,
            }}
          />
        </div>

        <button
          onClick={() => {
            setGrpcActive(!grpcActive);
            setGrpcLogs((prev) => [
              ...prev,
              `[gRPC] Server status toggled manually to: ${!grpcActive ? 'RUNNING' : 'STOPPED'}`,
            ]);
          }}
          style={{
            alignSelf: 'flex-end',
            padding: '8px 16px',
            fontSize: '11px',
            fontWeight: 700,
            borderRadius: '6px',
            border: 'none',
            background: grpcActive
              ? '#ef4444'
              : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)',
          }}
        >
          {grpcActive ? t('ecosystem.stopDaemon') : t('ecosystem.startDaemon')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {t('ecosystem.daemonConsole')}
        </span>
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '10px',
            height: '140px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#a5b4fc',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
          className="custom-scrollbar"
        >
          {grpcLogs.map((log, i) => (
            <div key={i} style={{ lineBreak: 'anywhere' }}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
