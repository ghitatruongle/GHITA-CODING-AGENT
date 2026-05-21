// ==============================================================================
// GHITA CODING AGENT — Devices View (Real Server + IP Display)
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DeviceInfo } from '@ghita/shared';
import { useAppStore } from '../stores/appStore';

interface ServerHealth {
  status?: string;
  pairingCode?: string;
  codeExpiresAt?: number;
  connectedDevices?: number;
  port?: number;
  uptime?: number;
  localIps?: string[];
  hostname?: string;
  devices?: DeviceInfo[];
}

export function DevicesView() {
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
        if (result.devices) {
          setConnectedDevices(result.devices);
        } else {
          setConnectedDevices([]);
        }
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
          if (result.devices) {
            setConnectedDevices(result.devices);
          } else {
            setConnectedDevices([]);
          }
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
      const remaining = Math.max(0, Math.round((health.codeExpiresAt! - Date.now()) / 1000));
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

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const formatUptime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const primaryIp = health?.localIps?.[0] || null;
  const port = health?.port || 8080;

  return (
    <div style={{ padding: '24px', overflow: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Devices
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13px' }}>
        Kết nối điện thoại với máy tính
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
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Communication Server</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: serverStatus === 'listening' ? 'var(--success)' : 'var(--text-muted)', display: 'inline-block' }} />
              <span style={{ fontSize: '13px', color: serverStatus === 'listening' ? 'var(--success)' : 'var(--text-muted)' }}>
                {serverStatus === 'listening' ? 'Đang chạy' : serverStatus === 'error' ? 'Lỗi' : 'Đã tắt'}
              </span>
              {health?.uptime != null && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>Uptime: {formatUptime(health.uptime)}</span>}
            </div>
          </div>
          <button
            onClick={serverStatus === 'listening' ? handleStopServer : handleStartServer}
            disabled={isStarting}
            style={{ padding: '10px 24px', background: serverStatus === 'listening' ? 'var(--error)' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: isStarting ? 'not-allowed' : 'pointer', opacity: isStarting ? 0.6 : 1 }}
          >
            {isStarting ? 'Đang khởi động...' : serverStatus === 'listening' ? 'Tắt Server' : 'Bật Server'}
          </button>
        </div>

        {/* IP + Port info */}
        {serverStatus === 'listening' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1.2fr', gap: '12px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>IP Address</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {primaryIp || 'Đang tìm...'}
              </div>
              {health?.localIps && health.localIps.length > 1 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-all' }}>
                  IP khác: {health.localIps.slice(1).join(', ')}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Port</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{port}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Tên Máy (Bluetooth)</div>
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
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Địa chỉ kết nối</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                http://{primaryIp}:{port}
              </div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`http://${primaryIp}:${port}`)}
              style={{ padding: '6px 12px', background: 'var(--bg-active)', color: 'var(--accent-primary)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Pairing Code */}
      {serverStatus === 'listening' && health?.pairingCode && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px' }}>Mã ghép đôi</h3>
          <div style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '8px', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', background: 'var(--bg-tertiary)', padding: '16px 32px', borderRadius: 'var(--radius-md)', display: 'inline-block', marginBottom: '12px' }}>
            {health.pairingCode}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hết hạn sau: {formatCountdown(codeCountdown)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Nhập mã này trên ứng dụng điện thoại để kết nối</div>
        </div>
      )}

      {/* Bluetooth Connection Guide */}
      {serverStatus === 'listening' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '22px' }}>🔵</span>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Kết nối qua Bluetooth</h3>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <p style={{ marginBottom: '8px' }}>Trên điện thoại, chuyển sang tab <strong>🔵 Bluetooth</strong> và nhập tên máy tính:</p>
            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', background: 'var(--bg-tertiary)', padding: '12px 20px', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '12px', letterSpacing: '2px', wordBreak: 'break-all' }}>
              {health?.hostname || 'DESKTOP'}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              💡 Không cần nhập IP hay mã ghép đôi — điện thoại sẽ tự động tìm và kết nối tới máy tính này.
            </p>
          </div>
        </div>
      )}

      {/* Connected Devices */}
      {health?.devices && health.devices.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Thiết bị đã kết nối</h3>
          </div>
          {health.devices.map((device, index) => (
            <div key={`${device.id}-${index}`} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>{device.platform === 'android' ? '📱' : '💻'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{device.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{device.platform} - Last seen: {new Date(device.lastSeen).toLocaleTimeString()}</div>
              </div>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: device.connected ? 'var(--success)' : 'var(--text-muted)' }} />
            </div>
          ))}
        </div>
      )}

      {/* Instructions when server is off */}
      {serverStatus !== 'listening' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Hướng dẫn kết nối</h3>
          <ol style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.8, paddingLeft: '20px' }}>
            <li>Nhấn <strong>"Bật Server"</strong> để khởi động Socket.io server</li>
            <li>Địa chỉ IP, mã ghép đôi, và tên máy sẽ hiện ra</li>
            <li>Mở ứng dụng GHITA trên điện thoại</li>
            <li><strong>Wi-Fi:</strong> Nhập mã ghép đôi 6 ký tự → Kết nối tự động</li>
            <li><strong>Bluetooth:</strong> Nhập tên máy tính hiển thị ở trên → Kết nối không cần mã</li>
          </ol>
        </div>
      )}
    </div>
  );
}
