// @ghita/mobile-companion -- Bluetooth Pairing (SIMULATION ONLY)
//
// This is NOT a Bluetooth stack: it never radios anything. scan() only
// returns devices injected via addDiscoveredDevice() (test harness), and
// pair() refuses device ids that were never discovered. Real BLE pairing in
// the mobile app goes through react-native-bluetooth-classic instead
// (apps/mobile/src/services/bluetoothService.ts).

import type { BluetoothDevice } from './types.js';

export class BluetoothPairing {
  private readonly discoveredDevices = new Map<string, BluetoothDevice>();
  private readonly pairedDevices = new Set<string>();

  /** Returns only previously injected devices — performs no actual BLE scan. */
  async scan(_timeoutMs = 5000): Promise<readonly BluetoothDevice[]> {
    return [...this.discoveredDevices.values()];
  }

  async pair(deviceId: string, pin: string): Promise<boolean> {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be 6 digits');
    }
    if (!this.discoveredDevices.has(deviceId)) {
      // Blindly accepting unknown ids would fake a successful pairing.
      throw new Error(`Cannot pair: device "${deviceId}" was never discovered`);
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
