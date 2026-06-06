// ==============================================================================
// GHITA CODING AGENT - Mobile Screen Component (Phase 19 Bonus — Update 0.0.3)
// ==============================================================================
// React component that displays mobile device screen and handles touch input.
// - Connects to Tauri backend via invoke('mobile_adb_*')
// - Auto-refresh screenshot at configurable interval
// - Click/tap on screen image translates to device coordinates (DPI aware)
// - Visual feedback: ripple animation on tap
// - Multi-device selector
// ==============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

// ----- Tauri bridge types (mirrors mobile-adb.ts) -----

export interface AdbDevice {
  serial: string;
  state: 'device' | 'unauthorized' | 'offline' | 'unknown';
  product?: string;
  transport?: 'usb' | 'tcp';
}

export interface TauriResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<TauriResult<T>> {
  if (typeof window === 'undefined' || !window.__TAURI__) {
    return { ok: false, error: 'Tauri runtime not available' };
  }
  try {
    const data = await window.__TAURI__.core.invoke<T>(cmd, args);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ----- Component -----

export interface MobileScreenProps {
  deviceSerial?: string;
  refreshIntervalMs?: number;
  enableTouch?: boolean;
  onTap?: (x: number, y: number) => void;
  className?: string;
}

export function MobileScreen({
  deviceSerial,
  refreshIntervalMs = 1000,
  enableTouch = true,
  onTap,
  className,
}: MobileScreenProps) {
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [currentDevice, setCurrentDevice] = useState<string | null>(deviceSerial ?? null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rippleIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await tauriInvoke<AdbDevice[]>('mobile_adb_list_devices');
      if (cancelled) return;
      if (res.ok && res.data) {
        setDevices(res.data);
        if (!currentDevice) {
          const first = res.data.find((d) => d.state === 'device');
          if (first) setCurrentDevice(first.serial);
        }
      } else {
        setError(res.error ?? 'Failed to list devices');
      }
    })();
    return () => { cancelled = true; };
  }, [currentDevice]);

  const capture = useCallback(async () => {
    if (!currentDevice) return;
    setRefreshing(true);
    const res = await tauriInvoke<string>('mobile_adb_screenshot', { serial: currentDevice });
    setRefreshing(false);
    if (res.ok && res.data) {
      setScreenshot(res.data);
      setError(null);
    } else {
      setError(res.error ?? 'Screenshot failed');
    }
  }, [currentDevice]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoRefresh && currentDevice) {
      capture();
      intervalRef.current = setInterval(capture, refreshIntervalMs);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, currentDevice, refreshIntervalMs, capture]);

  const handleImageClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!enableTouch || !currentDevice || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    const deviceX = Math.round(clickX * scaleX);
    const deviceY = Math.round(clickY * scaleY);

    const id = ++rippleIdRef.current;
    setRipples((prev) => [...prev, { id, x: clickX, y: clickY }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);

    const res = await tauriInvoke<void>('mobile_adb_tap', {
      x: deviceX,
      y: deviceY,
      serial: currentDevice,
    });
    if (!res.ok) setError(res.error ?? 'Tap failed');
    onTap?.(deviceX, deviceY);
  }, [enableTouch, currentDevice, onTap]);

  return (
    <div className={`mobile-screen ${className ?? ''}`} style={styles.container}>
      <div style={styles.header}>
        <select
          value={currentDevice ?? ''}
          onChange={(e) => setCurrentDevice(e.target.value || null)}
          style={styles.select}
        >
          <option value="">— Select device —</option>
          {devices.map((d) => (
            <option key={d.serial} value={d.serial} disabled={d.state !== 'device'}>
              {d.serial} {d.product ? `(${d.product})` : ''} {d.state !== 'device' ? `[${d.state}]` : ''}
            </option>
          ))}
        </select>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh
        </label>
        <button onClick={capture} disabled={!currentDevice || refreshing} style={styles.button}>
          {refreshing ? '⟳ Capturing…' : '📷 Capture'}
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={styles.dismissBtn}>×</button>
        </div>
      )}

      <div style={styles.screenContainer}>
        {screenshot ? (
          <>
            <img
              ref={imgRef}
              src={screenshot}
              alt={`Mobile screen ${currentDevice ?? ''}`}
              onClick={handleImageClick}
              draggable={false}
              style={{
                ...styles.screenImage,
                cursor: enableTouch ? 'crosshair' : 'default',
              }}
            />
            {ripples.map((r) => (
              <span
                key={r.id}
                style={{
                  ...styles.ripple,
                  left: r.x,
                  top: r.y,
                }}
              />
            ))}
          </>
        ) : (
          <div style={styles.placeholder}>
            {currentDevice ? 'No screenshot yet' : 'No device selected'}
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <span>Device: {currentDevice ?? '(none)'}</span>
        <span>Refresh: {refreshIntervalMs}ms</span>
        <span>Touch: {enableTouch ? 'enabled' : 'disabled'}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#1a1a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
  },
  header: {
    display: 'flex',
    gap: 8,
    padding: 8,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  select: {
    flex: 1,
    padding: '4px 8px',
    background: '#2a2a2a',
    color: '#e0e0e0',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 4,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    userSelect: 'none',
  },
  button: {
    padding: '4px 12px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    background: '#7f1d1d',
    color: '#fecaca',
    fontSize: '12px',
  },
  dismissBtn: {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '16px',
  },
  screenContainer: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#000',
    minHeight: 200,
  },
  screenImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    userSelect: 'none',
  },
  ripple: {
    position: 'absolute',
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
    borderRadius: '50%',
    background: 'rgba(59, 130, 246, 0.5)',
    animation: 'ripple-anim 0.6s ease-out',
    pointerEvents: 'none',
  },
  placeholder: {
    color: '#666',
    padding: 20,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    fontSize: '11px',
    color: '#888',
  },
};

export default MobileScreen;
