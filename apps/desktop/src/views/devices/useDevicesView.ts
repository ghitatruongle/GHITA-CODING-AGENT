// Extracted logic from DevicesView (v0.1.5 lint max-lines cleanup)
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n';
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

  // Load initial LAN setting
  useEffect(() => {
    const loadLan = async () => {
      try {
        const enabled = await invoke<boolean>('get_lan_enabled');
        setLanEnabled(enabled);
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
        // Start server again after 1.5 seconds
        setTimeout(async () => {
          try {
            await invoke<string>('start_server');
            setTimeout(pollStatus, 1500);
            setError(null);
          } catch (e) {
            setError(String(e));
            setServerStatus('error');
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
