// ==============================================================================
// GHITA CODING AGENT — Bluetooth Service
// Device discovery and connection via Bluetooth Classic
// ==============================================================================

import { Platform, PermissionsAndroid } from 'react-native';

// Dynamic import to avoid crash if module not installed yet
interface RNBluetoothClassicModule {
  isBluetoothAvailable?: () => Promise<boolean>;
  isBluetoothEnabled?: () => Promise<boolean>;
  getBondedDevices?: () => Promise<Array<{ address: string; name: string }>>;
  startDiscovery?: () => Promise<boolean>;
  cancelDiscovery?: () => Promise<void>;
  onDeviceDiscovered?: (callback: (device: { address: string; name: string; rssi?: number; bonded?: boolean }) => void) => void;
  removeAllListeners?: (eventName: string) => void;
  connectToDevice?: (address: string, options: { delimiter: string; charset: string }) => Promise<{
    write: (data: string) => Promise<void>;
    disconnect: () => void;
    onDataReceived: (callback: (data: string | { data: string }) => void) => void;
  }>;
}

let RNBluetoothClassic: RNBluetoothClassicModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNBluetoothClassic = require('react-native-bluetooth-classic').default;
} catch {
  // Module not available
}

export interface BluetoothDevice {
  address: string;
  name: string;
  rssi?: number;
  bonded?: boolean;
}

export type DiscoveryCallback = (devices: BluetoothDevice[]) => void;

class BluetoothService {
  private isDiscovering = false;
  private discoveredDevices: Map<string, BluetoothDevice> = new Map();
  private onDeviceFound?: DiscoveryCallback;

  /**
   * Check if Bluetooth is available and enabled
   */
  async isAvailable(): Promise<boolean> {
    if (!RNBluetoothClassic?.isBluetoothAvailable || !RNBluetoothClassic?.isBluetoothEnabled) return false;
    try {
      const available = await RNBluetoothClassic.isBluetoothAvailable();
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      return available && enabled;
    } catch {
      return false;
    }
  }

  /**
   * Request Bluetooth permissions (Android 12+)
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      if (Platform.Version >= 31) {
        // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          results['android.permission.BLUETOOTH_SCAN'] === 'granted' &&
          results['android.permission.BLUETOOTH_CONNECT'] === 'granted'
        );
      } else {
        // Older Android needs location permission for BT discovery
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return result === 'granted';
      }
    } catch {
      return false;
    }
  }

  /**
   * Start discovering nearby Bluetooth devices
   */
  async startDiscovery(callback: DiscoveryCallback): Promise<boolean> {
    if (!RNBluetoothClassic) return false;

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return false;

      const available = await this.isAvailable();
      if (!available) return false;

      this.discoveredDevices.clear();
      this.onDeviceFound = callback;
      this.isDiscovering = true;

      // Get already bonded devices first
      try {
        if (RNBluetoothClassic.getBondedDevices) {
          const bonded = await RNBluetoothClassic.getBondedDevices();
          for (const device of bonded) {
            const btDevice: BluetoothDevice = {
              address: device.address,
              name: device.name || 'Unknown Device',
              bonded: true,
            };
            this.discoveredDevices.set(device.address, btDevice);
          }
          callback([...this.discoveredDevices.values()]);
        }
      } catch {
        // Ignore bonded device errors
      }

      // Start discovery — remove previous listener to prevent accumulation
      if (RNBluetoothClassic.removeAllListeners) {
        RNBluetoothClassic.removeAllListeners('onDeviceDiscovered');
      }
      if (RNBluetoothClassic.onDeviceDiscovered) {
        RNBluetoothClassic.onDeviceDiscovered((device) => {
          if (!this.isDiscovering) return;
          const btDevice: BluetoothDevice = {
            address: device.address,
            name: device.name || 'Unknown Device',
            rssi: device.rssi,
            bonded: device.bonded,
          };
          this.discoveredDevices.set(device.address, btDevice);
          callback([...this.discoveredDevices.values()]);
        });
      }

      if (RNBluetoothClassic.startDiscovery) {
        await RNBluetoothClassic.startDiscovery();
      }
      return true;
    } catch (e) {
      console.error('[Bluetooth] Discovery failed:', e);
      this.isDiscovering = false;
      return false;
    }
  }

  /**
   * Stop discovery
   */
  async stopDiscovery(): Promise<void> {
    if (!RNBluetoothClassic?.cancelDiscovery || !this.isDiscovering) return;
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch {
      // Ignore
    }
    this.isDiscovering = false;
  }

  /**
   * Connect to a Bluetooth device and read server info
   * Returns the server address (IP:Port) if the device is a GHITA desktop
   */
  async connectToDevice(device: BluetoothDevice): Promise<string | null> {
    if (!RNBluetoothClassic) return null;

    try {
      // Try to connect to the device via RFCOMM
      if (!RNBluetoothClassic.connectToDevice) return null;
      const connection = await RNBluetoothClassic.connectToDevice(device.address, {
        delimiter: '\n',
        charset: 'utf-8',
      });

      // Send a discovery request
      await connection.write('GHITA_DISCOVER\n');

      // Read response with timeout
      return new Promise((resolve) => {
        let isResolved = false;

        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            try {
              void connection.disconnect();
            } catch (err) {
              console.error('[Bluetooth] Disconnect error on timeout:', err);
            }
            resolve(null);
          }
        }, 5000);

        connection.onDataReceived((data) => {
          if (isResolved) return;
          const message = typeof data === 'string' ? data : data?.data;

          // Expected format: "GHITA_SERVER|ip:port"
          if (message && message.includes('GHITA_SERVER|')) {
            isResolved = true;
            clearTimeout(timeout);
            try {
              void connection.disconnect();
            } catch (err) {
              console.error('[Bluetooth] Disconnect error on success:', err);
            }
            const cleanMessage = message.substring(message.indexOf('GHITA_SERVER|'));
            resolve(cleanMessage.replace('GHITA_SERVER|', '').trim());
          }
        });
      });
    } catch (e) {
      console.error('[Bluetooth] Connection failed:', e);
      return null;
    }
  }

  /**
   * Check if the module is available
   */
  get isModuleAvailable(): boolean {
    return RNBluetoothClassic !== null;
  }
}

export const bluetoothService = new BluetoothService();
