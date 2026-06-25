// ==============================================================================
// @ghita/mobile-companion -- Bluetooth Pairing
// ==============================================================================

import type { BluetoothDevice } from './types.js';

export class BluetoothPairing {
  private readonly discoveredDevices = new Map<string, BluetoothDevice>();
  private readonly pairedDevices = new Set<string>();

  async scan(_timeoutMs = 5000): Promise<readonly BluetoothDevice[]> {
    return [...this.discoveredDevices.values()];
  }

  async pair(deviceId: string, pin: string): Promise<boolean> {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be 6 digits');
    }
    this.pairedDevices.add(deviceId);
    return true;
  }

  async unpair(deviceId: string): Promise<void> {
    this.pairedDevices.delete(deviceId);
  }

  isPaired(deviceId: string): boolean {
    return this.pairedDevices.has(deviceId);
  }

  getPairedDevices(): readonly string[] {
    return [...this.pairedDevices];
  }

  addDiscoveredDevice(device: BluetoothDevice): void {
    this.discoveredDevices.set(device.id, device);
  }
}
