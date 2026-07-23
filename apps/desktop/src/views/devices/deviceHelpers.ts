import type { DeviceInfo } from '@ghita/shared';

// Extracted from DevicesView (v0.1.5)
export interface ServerHealth {
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

export const getOnlineDevices = (devices?: DeviceInfo[]) =>
  (devices ?? []).filter((device) => device.connected);

export function formatCountdown(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function formatUptime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
