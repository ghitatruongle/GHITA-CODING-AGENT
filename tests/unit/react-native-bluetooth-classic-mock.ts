import { vi } from 'vitest';

export const mockBluetoothClassic = {
  isBluetoothAvailable: vi.fn(),
  isBluetoothEnabled: vi.fn(),
  getBondedDevices: vi.fn(),
  startDiscovery: vi.fn(),
  cancelDiscovery: vi.fn(),
  onDeviceDiscovered: vi.fn(),
  removeAllListeners: vi.fn(),
  connectToDevice: vi.fn(),
};

export default mockBluetoothClassic;
