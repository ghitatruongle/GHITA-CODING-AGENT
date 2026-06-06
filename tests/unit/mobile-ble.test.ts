import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

import mockBluetoothClassic from './react-native-bluetooth-classic-mock.ts';

// Expose mock for bluetoothService to consume in tests without triggering runtime require
// @ts-ignore
globalThis.mockBluetoothClassic = mockBluetoothClassic;

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn().mockReturnValue({
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
      connected: true,
    }),
  };
});

vi.mock('../../apps/mobile/src/services/storageService.js', () => ({
  getAuthToken: vi.fn().mockResolvedValue('fake-token'),
  saveAuthToken: vi.fn().mockResolvedValue(true),
  clearAuthToken: vi.fn().mockResolvedValue(true),
}));

let socketService: any;
let bluetoothService: any;

beforeAll(async () => {
  const socketMod = await import('../../apps/mobile/src/services/socketService.js');
  const bluetoothMod = await import('../../apps/mobile/src/services/bluetoothService.js');
  socketService = socketMod.socketService;
  bluetoothService = bluetoothMod.bluetoothService;
});

describe('20: Mobile BLE & Socket Transport', () => {
  describe('socketService', () => {
    beforeEach(() => {
      socketService.clearCallbacks();
      socketService.disconnect();
    });

    it('should have sendTouch method', () => {
      expect(typeof socketService.sendTouch).toBe('function');
    });

    it('should fail gracefully if not connected', () => {
      socketService.sendTouch(0.5, 0.5);
      expect(socketService.isConnected).toBe(false);
    });
  });

  describe('bluetoothService', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should check if bluetooth is available and enabled', async () => {
      console.log('BLUETOOTH SERVICE MODULE OBJECT:', bluetoothService);
      mockBluetoothClassic.isBluetoothAvailable.mockResolvedValue(true);
      mockBluetoothClassic.isBluetoothEnabled.mockResolvedValue(false);
      expect(await bluetoothService.isAvailable()).toBe(false);

      mockBluetoothClassic.isBluetoothEnabled.mockResolvedValue(true);
      expect(await bluetoothService.isAvailable()).toBe(true);
    });

    it('should return false if check throws', async () => {
      mockBluetoothClassic.isBluetoothAvailable.mockRejectedValue(new Error('fail'));
      expect(await bluetoothService.isAvailable()).toBe(false);
    });

    it('should find bonded devices and scan for new ones', async () => {
      mockBluetoothClassic.isBluetoothAvailable.mockResolvedValue(true);
      mockBluetoothClassic.isBluetoothEnabled.mockResolvedValue(true);
      mockBluetoothClassic.getBondedDevices.mockResolvedValue([
        { address: '11:22:33:44:55:66', name: 'Bonded 1' },
      ]);
      mockBluetoothClassic.startDiscovery.mockResolvedValue(true);
      mockBluetoothClassic.onDeviceDiscovered.mockImplementation((callback) => {
        callback({
          address: '66:55:44:33:22:11',
          name: 'Discovered 1',
          rssi: -60,
          bonded: false,
        });
      });

      const callback = vi.fn();
      const success = await bluetoothService.startDiscovery(callback);

      expect(success).toBe(true);
      expect(callback).toHaveBeenCalled();
      const lastCallArg = callback.mock.calls[callback.mock.calls.length - 1][0];
      expect(lastCallArg).toContainEqual(expect.objectContaining({ address: '11:22:33:44:55:66' }));
      expect(lastCallArg).toContainEqual(expect.objectContaining({ address: '66:55:44:33:22:11' }));
    });

    it('should connect to device and parse server address', async () => {
      const mockConnection = {
        write: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        onDataReceived: vi.fn().mockImplementation((callback) => {
          setTimeout(() => {
            callback('GHITA_SERVER|192.168.1.50:8080\n');
          }, 10);
          return { remove: vi.fn() };
        }),
      };
      mockBluetoothClassic.connectToDevice.mockResolvedValue(mockConnection);
      mockBluetoothClassic.isBluetoothAvailable.mockResolvedValue(true);
      mockBluetoothClassic.isBluetoothEnabled.mockResolvedValue(true);

      const address = await bluetoothService.connectToDevice({
        address: '00:11:22:33:44:55',
        name: 'GHITA-Desktop',
      });

      expect(address).toBe('192.168.1.50:8080');
      expect(mockConnection.write).toHaveBeenCalledWith('GHITA_DISCOVER\n');
      expect(mockConnection.disconnect).toHaveBeenCalled();
    });

    it('should timeout and return null if no handshake response', async () => {
      const mockConnection = {
        write: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        onDataReceived: vi.fn().mockReturnValue({ remove: vi.fn() }),
      };
      mockBluetoothClassic.connectToDevice.mockResolvedValue(mockConnection);

      vi.useFakeTimers();

      const connectPromise = bluetoothService.connectToDevice({
        address: '00:11:22:33:44:55',
        name: 'GHITA-Desktop',
      });

      await vi.advanceTimersByTimeAsync(5000);

      const address = await connectPromise;
      expect(address).toBeNull();
      expect(mockConnection.disconnect).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
