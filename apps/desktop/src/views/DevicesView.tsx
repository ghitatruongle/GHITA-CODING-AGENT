import { ServerControlCard } from './devices/ServerControlCard';
import { PairingCodeCard } from './devices/PairingCodeCard';
import { ConnectedDevicesList } from './devices/ConnectedDevicesList';
import { OfflineHelp } from './devices/OfflineHelp';
import { useDevicesView } from './devices/useDevicesView';

export function DevicesView() {
  const {
    t,
    serverStatus,
    health,
    isStarting,
    error,
    setError,
    codeCountdown,
    lanEnabled,
    primaryIp,
    port,
    handleStartServer,
    handleStopServer,
    handleToggleLan,
    handleUnpairDevice,
    formatCountdown,
    formatUptime,
  } = useDevicesView();

  return (
    <div style={{ padding: '24px', overflow: 'auto', height: '100%' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          marginBottom: '8px',
          background: 'var(--accent-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {t('devices.title')}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13px' }}>
        {t('devices.subtitle')}
      </p>

      {error && (
        <div
          style={{
            background: 'var(--error-bg)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '16px',
            color: 'var(--error)',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--error)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '16px',
            }}
          >
            x
          </button>
        </div>
      )}

      <ServerControlCard
        t={t}
        serverStatus={serverStatus}
        health={health}
        isStarting={isStarting}
        lanEnabled={lanEnabled}
        primaryIp={primaryIp}
        port={port}
        handleStartServer={handleStartServer}
        handleStopServer={handleStopServer}
        handleToggleLan={handleToggleLan}
        formatUptime={formatUptime}
      />
      <PairingCodeCard
        t={t}
        serverStatus={serverStatus}
        health={health}
        codeCountdown={codeCountdown}
        formatCountdown={formatCountdown}
      />
      <ConnectedDevicesList t={t} health={health} handleUnpairDevice={handleUnpairDevice} />
      <OfflineHelp t={t} serverStatus={serverStatus} health={health} />
    </div>
  );
}
