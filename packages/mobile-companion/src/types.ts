// ==============================================================================
// @ghita/mobile-companion -- Type Definitions
// ==============================================================================

export interface BluetoothDevice {
  readonly id: string;
  readonly name: string;
  readonly rssi: number;
  readonly paired: boolean;
}

export interface NetworkDevice {
  readonly ip: string;
  readonly port: number;
  readonly name: string;
  readonly type: 'desktop' | 'mobile';
}

export interface PushNotification {
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, string>;
  readonly priority: 'low' | 'normal' | 'high';
}

export interface DeviceCapabilities {
  readonly hasBluetooth: boolean;
  readonly hasCamera: boolean;
  readonly hasGPS: boolean;
  readonly hasAccelerometer: boolean;
  readonly screenSize: { width: number; height: number };
  readonly os: string;
  readonly osVersion: string;
}
