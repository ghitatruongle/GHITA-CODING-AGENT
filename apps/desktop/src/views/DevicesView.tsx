// ==============================================================================
// GHITA CODING AGENT — Devices View (Phase 6 — Live Data)
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { generatePairingCode, getRelativeTime } from '@ghita/shared';

export function DevicesView() {
  const serverStatus = useAppStore((s) => s.serverStatus);
  const pairingCode = useAppStore((s) => s.pairingCode);
  const connectedDevices = useAppStore((s) => s.connectedDevices);
  const setPairingCode = useAppStore((s) => s.setPairingCode);

  const [codeCountdown, setCodeCountdown] = useState(300);

  // Initialize pairing code if not set
  useEffect(() => {
    if (!pairingCode) {
      setPairingCode(generatePairingCode());
    }
  }, [pairingCode, setPairingCode]);

  // Countdown timer for pairing code expiry
  useEffect(() => {
    setCodeCountdown(300);
    const timer = setInterval(() => {
      setCodeCountdown((prev) => {
        if (prev <= 1) {
          setPairingCode(generatePairingCode());
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pairingCode, setPairingCode]);

  const handleNewCode = useCallback(() => {
    setPairingCode(generatePairingCode());
    setCodeCountdown(300);
  }, [setPairingCode]);

  const formatCountdown = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const statusColor =
    serverStatus === 'listening'
      ? 'var(--success)'
      : serverStatus === 'error'
        ? 'var(--error)'
        : 'var(--text-muted)';

  const statusLabel =
    serverStatus === 'listening'
      ? '● Listening'
      : serverStatus === 'error'
        ? '● Error'
        : '○ Offline';

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
        📱 Kết nối thiết bị
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '13px' }}>
        Kết nối điện thoại Android để điều khiển desktop từ xa qua Socket.io.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        {/* Server Status */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
          }}
        >
          <h4 style={{ color: 'var(--accent-primary)', marginBottom: '12px', fontSize: '15px' }}>
            📶 Socket.io Server
          </h4>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div>Port: <code style={{ color: 'var(--accent-primary)' }}>8080</code></div>
            <div>
              Status: <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
            </div>
            <div>
              Devices: <span style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>
                {connectedDevices.length}
              </span>
            </div>
          </div>
        </div>

        {/* Connection Info */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
          }}
        >
          <h4 style={{ color: 'var(--accent-primary)', marginBottom: '12px', fontSize: '15px' }}>
            📋 Hướng dẫn kết nối
          </h4>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div>1. Mở ứng dụng GHITA trên điện thoại</div>
            <div>2. Nhập địa chỉ IP máy tính và port 8080</div>
            <div>3. Nhập mã ghép đôi bên dưới</div>
            <div>4. Bắt đầu điều khiển từ xa!</div>
          </div>
        </div>
      </div>

      {/* Pairing Code */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(99, 102, 241, 0.1))',
          border: '1px solid var(--border-accent)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          textAlign: 'center',
          maxWidth: '400px',
          margin: '0 auto',
        }}
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '14px' }}>
          Mã ghép đôi:
        </p>
        <div
          style={{
            fontSize: '40px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            letterSpacing: '12px',
            color: 'var(--accent-secondary)',
            marginBottom: '8px',
            textShadow: '0 0 20px rgba(167, 139, 250, 0.3)',
          }}
        >
          {pairingCode ?? '------'}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
          Hết hạn sau: <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{formatCountdown(codeCountdown)}</span>
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
          Nhập mã này trên điện thoại để kết nối
        </p>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleNewCode}
            style={{
              padding: '8px 20px',
              background: 'var(--accent-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '13px',
              transition: 'opacity var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            🔄 Tạo mã mới
          </button>
        </div>
      </div>

      {/* Connected devices */}
      <div style={{ marginTop: '32px' }}>
        <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Thiết bị đã kết nối ({connectedDevices.length})
        </h3>
        {connectedDevices.length === 0 ? (
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px',
            }}
          >
            Chưa có thiết bị nào kết nối. Nhập mã ghép đôi trên điện thoại để bắt đầu.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {connectedDevices.map((device) => (
              <div
                key={device.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: '3px solid var(--success)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '22px' }}>📱</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {device.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {device.platform} · {getRelativeTime(device.lastSeen)}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: device.connected ? 'var(--success-bg)' : 'var(--error-bg)',
                    color: device.connected ? 'var(--success)' : 'var(--error)',
                    fontWeight: 600,
                  }}
                >
                  {device.connected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
