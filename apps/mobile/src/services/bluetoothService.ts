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
  onDeviceDiscovered?: (
    callback: (device: { address: string; name: string; rssi?: number; bonded?: boolean }) => void,
  ) => void;
  removeAllListeners?: (eventName: string) => void;
  connectToDevice?: (
    address: string,
    options: { delimiter: string; charset: string },
  ) => Promise<{
    write: (data: string) => Promise<void>;
    disconnect: () => void;
    onDataReceived: (
      callback: (data: string | { data: string }) => void,
    ) => { remove?: () => void } | void;
  }>;
}

let RNBluetoothClassic: RNBluetoothClassicModule | null = null;
const globalMock = (globalThis as unknown as Record<string, unknown>).mockBluetoothClassic;
if (globalMock) {
  RNBluetoothClassic = globalMock as RNBluetoothClassicModule;
} else {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RNBluetoothClassic = require('react-native-bluetooth-classic').default;
  } catch {
    // Module not available
  }
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
  private discoveryTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Check if Bluetooth is available and enabled
   */
  async isAvailable(): Promise<boolean> {
    if (!RNBluetoothClassic?.isBluetoothAvailable || !RNBluetoothClassic?.isBluetoothEnabled)
      return false;
    try {
      const available = await RNBluetoothClassic.isBluetoothAvailable();
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      return available && enabled;
    } catch {
      return false;
    }
  }

  /**
   * Request Bluetooth permissions.
   *
   * SECURITY (audit fix 4.5): Android 12+ (API 31+) does NOT require
   * ACCESS_FINE_LOCATION for Bluetooth scanning as long as the
   * `neverForLocation` flag is set on the BLUETOOTH_SCAN permission in
   * AndroidManifest.xml. Asking for it anyway is unnecessary AND would
   * require a privacy disclosure on the Play Store listing.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      if (Platform.Version >= 31) {
        // Android 12+ (API 31+): only Bluetooth permissions are required.
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          results['android.permission.BLUETOOTH_SCAN'] === 'granted' &&
          results['android.permission.BLUETOOTH_CONNECT'] === 'granted'
        );
      }
      // Android 11 and below (API <= 30): legacy Bluetooth + Location.
      // BLUETOOTH + BLUETOOTH_ADMIN are install-time only; we still need
      // ACCESS_FINE_LOCATION at runtime for BLE scanning on these versions.
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return result === 'granted';
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

      // H5: Auto-stop discovery after 30 seconds to prevent indefinite scanning
      this.discoveryTimeout = setTimeout(() => {
        void this.stopDiscovery();
      }, 30000);

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
    this.isDiscovering = false;
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }
    if (!RNBluetoothClassic) return;

    // Remove listeners first to prevent duplicates/leaks
    if (RNBluetoothClassic.removeAllListeners) {
      try {
        RNBluetoothClassic.removeAllListeners('onDeviceDiscovered');
      } catch (err) {
        console.error('[Bluetooth] Failed to remove discover listeners:', err);
      }
    }

    if (!RNBluetoothClassic.cancelDiscovery) return;
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch {
      // Ignore
    }
  }

  /**
   * Connect to a Bluetooth device and read server info
   * Returns the server address (IP:Port) if the device is a GHITA desktop
   */
  async connectToDevice(device: BluetoothDevice, retries = 3): Promise<string | null> {
    if (!RNBluetoothClassic) return null;

    try {
      // Stop discovery before establishing RFCOMM connection
      await this.stopDiscovery();

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
        let subscription: { remove?: () => void } | null | void = null;

        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            if (subscription && typeof subscription.remove === 'function') {
              try {
                subscription.remove();
              } catch (e) {
                console.error('[Bluetooth] Failed to remove subscription on timeout:', e);
              }
            }
            try {
              void connection.disconnect();
            } catch (err) {
              console.error('[Bluetooth] Disconnect error on timeout:', err);
            }
            resolve(null);
          }
        }, 5000);

        try {
          subscription = connection.onDataReceived((data) => {
            if (isResolved) return;
            const message = typeof data === 'string' ? data : data?.data;

            // Expected format: "GHITA_SERVER|ip:port"
            if (message && message.includes('GHITA_SERVER|')) {
              isResolved = true;
              clearTimeout(timeout);
              if (subscription && typeof subscription.remove === 'function') {
                try {
                  subscription.remove();
                } catch (e) {
                  console.error('[Bluetooth] Failed to remove subscription on success:', e);
                }
              }
              try {
                void connection.disconnect();
              } catch (err) {
                console.error('[Bluetooth] Disconnect error on success:', err);
              }
              const cleanMessage = message.substring(message.indexOf('GHITA_SERVER|'));
              resolve(cleanMessage.replace('GHITA_SERVER|', '').trim());
            }
          });
        } catch (err) {
          console.error('[Bluetooth] Failed to subscribe to data:', err);
          isResolved = true;
          clearTimeout(timeout);
          try {
            void connection.disconnect();
          } catch (disconnectErr) {
            console.error('[Bluetooth] Disconnect error on sub fail:', disconnectErr);
          }
          resolve(null);
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Bluetooth] Connection failed (retries left ${retries}): ${msg}`);
      if (retries > 0) {
        const delay = (3 - retries + 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        return this.connectToDevice(device, retries - 1);
      }
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
