// ==============================================================================
// GHITA CODING AGENT — Devices View (Real Server + IP Display)
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DeviceInfo } from '@ghita/shared';
import { useAppStore } from '../stores/appStore';
import { useTranslation } from '../i18n';

interface ServerHealth {
  status?: string;
  pairingCode?: string;
  codeExpiresAt?: number;
  connectedDevices?: number;
  pairedDevices?: number;
  port?: number;
  uptime?: number;
  localIP?: string;
  localIps?: string[];
  hostname?: string;
  devices?: DeviceInfo[];
}

const getOnlineDevices = (devices?: DeviceInfo[]) => (devices ?? []).filter((device) => device.connected);

export function DevicesView() {
  const { t } = useTranslation();
  const serverStatus = useAppStore((s) => s.serverStatus);
  const setServerStatus = useAppStore((s) => s.setServerStatus);
  const setPairingCode = useAppStore((s) => s.setPairingCode);
  const setConnectedDevices = useAppStore((s) => s.setConnectedDevices);

  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeCountdown, setCodeCountdown] = useState(300);

  // Poll server status
  const pollStatus = useCallback(async () => {
    try {
      const result = await invoke<ServerHealth>('get_server_status');
      setHealth(result);
      if (result.status === 'ok') {
        setServerStatus('listening');
        setPairingCode(result.pairingCode || null);
        setConnectedDevices(getOnlineDevices(result.devices));
      } else {
        setServerStatus('offline');
        setPairingCode(null);
        setConnectedDevices([]);
      }
    } catch (e) {
      setServerStatus('error');
      setPairingCode(null);
      setConnectedDevices([]);
      setHealth(null);
    }
  }, [setServerStatus, setPairingCode, setConnectedDevices]);

  // Poll every 3 seconds and auto-start if offline
  useEffect(() => {
    const initAndPoll = async () => {
      try {
        const result = await invoke<ServerHealth>('get_server_status');
        setHealth(result);
        if (result.status === 'ok') {
          setServerStatus('listening');
          setPairingCode(result.pairingCode || null);
          setConnectedDevices(getOnlineDevices(result.devices));
        } else {
          setServerStatus('offline');
          setPairingCode(null);
          setConnectedDevices([]);
          await invoke('start_server');
          setTimeout(pollStatus, 1500);
        }
      } catch (e) {
        try {
          await invoke('start_server');
          setTimeout(pollStatus, 1500);
        } catch (_) {
          setServerStatus('error');
          setPairingCode(null);
          setConnectedDevices([]);
          setHealth(null);
        }
      }
    };

    initAndPoll();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [pollStatus, setServerStatus, setPairingCode, setConnectedDevices]);

  // Countdown for pairing code
  useEffect(() => {
    if (serverStatus !== 'listening' || !health?.codeExpiresAt) return;
    
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.round(((health.codeExpiresAt ?? 0) - Date.now()) / 1000));
      setCodeCountdown(remaining);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [serverStatus, health?.codeExpiresAt]);

  const handleStartServer = async () => {
    setIsStarting(true);
    setError(null);
    try {
      await invoke<string>('start_server');
      setTimeout(pollStatus, 2000);
    } catch (e) {
      setError(String(e));
      setServerStatus('error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopServer = async () => {
    try {
      await invoke<string>('stop_server');
      setServerStatus('offline');
      setHealth(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleUnpairDevice = async (deviceId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/unpair?deviceId=${deviceId}`, {
        method: 'POST',
      });
      if (response.ok) {
        pollStatus();
      } else {
        const errJson = await response.json();
        setError(errJson.error || 'Failed to unpair device');
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const formatUptime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const primaryIp = health?.localIP || health?.localIps?.[0] || null;
  const port = health?.port || 8080;

  return (
    <div style={{ padding: '24px', overflow: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {t('devices.title')}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13px' }}>
        {t('devices.subtitle')}
      </p>

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--error-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px', color: 'var(--error)', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontWeight: 600, fontSize: '16px' }}>x</button>
        </div>
      )}

      {/* Server Control */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('devices.communicationServer')}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: serverStatus === 'listening' ? 'var(--success)' : 'var(--text-muted)', display: 'inline-block' }} />
              <span style={{ fontSize: '13px', color: serverStatus === 'listening' ? 'var(--success)' : 'var(--text-muted)' }}>
                {serverStatus === 'listening' ? t('devices.statusRunning') : serverStatus === 'error' ? t('devices.statusError') : t('devices.statusOff')}
              </span>
              {health?.uptime != null && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{t('devices.uptime')} {formatUptime(health.uptime)}</span>}
            </div>
          </div>
          <button
            onClick={serverStatus === 'listening' ? handleStopServer : handleStartServer}
            disabled={isStarting}
            style={{ padding: '10px 24px', background: serverStatus === 'listening' ? 'var(--error)' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: isStarting ? 'not-allowed' : 'pointer', opacity: isStarting ? 0.6 : 1 }}
          >
            {isStarting ? t('devices.starting') : serverStatus === 'listening' ? t('devices.stopServer') : t('devices.startServer')}
          </button>
        </div>

        {/* IP + Port info */}
        {serverStatus === 'listening' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t('devices.ipAddress')}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {primaryIp || t('devices.searching')}
              </div>
              {health?.localIps && health.localIps.length > 1 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-all' }}>
                  {t('devices.otherIps')} {health.localIps.slice(1).join(', ')}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t('devices.port')}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{port}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t('devices.hostname')}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                {health?.hostname || 'DESKTOP'}
              </div>
            </div>
          </div>
        )}

        {/* Connection string */}
        {serverStatus === 'listening' && primaryIp && (
          <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t('devices.connectionAddress')}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                http://{primaryIp}:{port}
              </div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`http://${primaryIp}:${port}`)}
              style={{ padding: '6px 12px', background: 'var(--bg-active)', color: 'var(--accent-primary)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              {t('common.copy')}
            </button>
          </div>
        )}
      </div>

      {/* Pairing Code */}
      {serverStatus === 'listening' && health?.pairingCode && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px' }}>{t('devices.pairingCode')}</h3>
          <div style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '8px', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', background: 'var(--bg-tertiary)', padding: '16px 32px', borderRadius: 'var(--radius-md)', display: 'inline-block', marginBottom: '12px' }}>
            {health.pairingCode}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('devices.expiresAfter')} {formatCountdown(codeCountdown)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>{t('devices.pairingInstructions')}</div>
        </div>
      )}

      {/* Bluetooth Connection Guide */}
      {serverStatus === 'listening' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '22px' }}>🔵</span>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('devices.bluetoothConnection')}</h3>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <p style={{ marginBottom: '8px' }}>{t('devices.bluetoothGuide')}</p>
            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', background: 'var(--bg-tertiary)', padding: '12px 20px', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '12px', letterSpacing: '2px', wordBreak: 'break-all' }}>
              {health?.hostname || 'DESKTOP'}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {t('devices.bluetoothHint')}
            </p>
          </div>
        </div>
      )}

      {/* Connected Devices */}
      {health?.devices && health.devices.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('devices.connectedDevices')}</h3>
          </div>
          {health.devices.map((device, index) => (
            <div key={`${device.id}-${index}`} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>{device.platform === 'android' ? '📱' : '💻'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{device.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{device.platform} - {t('devices.lastSeen')} {new Date(device.lastSeen).toLocaleTimeString()}</div>
              </div>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: device.connected ? 'var(--success)' : 'var(--text-muted)' }} />
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

      {/* Instructions when server is off */}
      {serverStatus !== 'listening' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>{t('devices.connectionGuide')}</h3>
          <ol style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.8, paddingLeft: '20px' }}>
            <li>{t('devices.guideStep1')}</li>
            <li>{t('devices.guideStep2')}</li>
            <li>{t('devices.guideStep3')}</li>
            <li>{t('devices.guideStep4')}</li>
            <li>{t('devices.guideStep5')}</li>
          </ol>
        </div>
      )}
    </div>
  );
}
