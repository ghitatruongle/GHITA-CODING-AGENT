// @ghita/mobile-companion -- Network Discovery

import type { NetworkDevice } from './types.js';

export class NetworkDiscovery {
  private readonly devices = new Map<string, NetworkDevice>();

  async discover(port: number): Promise<readonly NetworkDevice[]> {
    return [...this.devices.values()].filter((d) => d.port === port);
  }

  registerDevice(device: NetworkDevice): void {
    this.devices.set(device.ip, device);
  }

  removeDevice(ip: string): void {
    this.devices.delete(ip);
  }

  getDevice(ip: string): NetworkDevice | undefined {
    return this.devices.get(ip);
  }

  getAllDevices(): readonly NetworkDevice[] {
    return [...this.devices.values()];
  }
}
