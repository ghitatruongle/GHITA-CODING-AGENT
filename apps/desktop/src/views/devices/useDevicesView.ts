// Extracted logic from DevicesView (v0.1.5 lint max-lines cleanup)
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n';
import { useActivePolling } from '../../hooks/useActivePolling';
import {
  getOnlineDevices,
  formatCountdown,
  formatUptime,
  type ServerHealth,
} from './deviceHelpers';

export function useDevicesView() {
  const { t } = useTranslation();
  const serverStatus = useAppStore((s) => s.serverStatus);
  const setServerStatus = useAppStore((s) => s.setServerStatus);
  const setPairingCode = useAppStore((s) => s.setPairingCode);
  const setConnectedDevices = useAppStore((s) => s.setConnectedDevices);

  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeCountdown, setCodeCountdown] = useState(300);
  const [lanEnabled, setLanEnabled] = useState(false);

  // deep-review fix (L5): guard delayed callbacks against firing after the
  // view unmounts (setState on an unmounted component).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load initial LAN setting
  useEffect(() => {
    const loadLan = async () => {
      try {
        const enabled = await invoke<boolean>('get_lan_enabled');
        if (mountedRef.current) setLanEnabled(enabled);
      } catch (e) {
        console.error('Failed to load LAN setting:', e);
      }
    };
    loadLan();
  }, []);

  const handleToggleLan = async () => {
    try {
      const targetValue = !lanEnabled;
      await invoke('set_lan_enabled', { enabled: targetValue });
      setLanEnabled(targetValue);

      // If server is currently running, we need to restart it to apply the binding changes
      if (serverStatus === 'listening') {
        setError('Đang áp dụng thay đổi và khởi động lại Server...');
        // Stop server
        await invoke('stop_server');
        setServerStatus('offline');
        setHealth(null);
        // Start server again after 1.5 seconds (deep-review L5: guard unmount)
        setTimeout(async () => {
          try {
            await invoke<string>('start_server');
            if (mountedRef.current) setTimeout(pollStatus, 1500);
            if (mountedRef.current) setError(null);
          } catch (e) {
            if (mountedRef.current) {
              setError(String(e));
              setServerStatus('error');
            }
          }
        }, 1500);
      }
    } catch (e) {
      setError(String(e));
    }
  };

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

  // Initial poll + auto-start the server if it is offline.
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
          if (mountedRef.current) setTimeout(pollStatus, 1500);
        }
      } catch (e) {
        try {
          await invoke('start_server');
          if (mountedRef.current) setTimeout(pollStatus, 1500);
        } catch (_) {
          setServerStatus('error');
          setPairingCode(null);
          setConnectedDevices([]);
          setHealth(null);
        }
      }
    };

    void initAndPoll();
  }, [pollStatus, setServerStatus, setPairingCode, setConnectedDevices]);

  // Ongoing polls only run while the Devices tab is active AND the window is
  // visible (previously a hard 3s interval ran even when the view was hidden).
  useActivePolling(3000, pollStatus, 'devices');

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
      if (mountedRef.current) setTimeout(pollStatus, 2000);
    } catch (e) {
      setError(String(e));
      setServerStatus('error');
    } finally {
      if (mountedRef.current) setIsStarting(false);
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
      // deep-review fix (L2): URL-encode the device id so ids containing
      // reserved characters cannot corrupt the query string.
      const response = await fetch(
        `http://127.0.0.1:${port}/unpair?deviceId=${encodeURIComponent(deviceId)}`,
        {
          method: 'POST',
        },
      );
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

  const primaryIp = health?.localIP || health?.localIps?.[0] || null;
  const port = health?.port || 39001;

  return {
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
  };
}
