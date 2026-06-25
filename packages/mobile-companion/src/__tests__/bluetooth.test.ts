// ==============================================================================
// @ghita/mobile-companion -- Comprehensive Tests
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BluetoothPairing } from '../bluetooth.js';
import { NetworkDiscovery } from '../network-discovery.js';
import { PushNotificationBridge } from '../push-bridge.js';
import { detectCapabilities } from '../device-capabilities.js';

// ============================================================
// BluetoothPairing
// ============================================================

describe('BluetoothPairing', () => {
  let bt: BluetoothPairing;

  beforeEach(() => {
    bt = new BluetoothPairing();
  });

  it('pairs with valid 6-digit PIN', async () => {
    const result = await bt.pair('device-1', '123456');
    expect(result).toBe(true);
    expect(bt.isPaired('device-1')).toBe(true);
  });

  it('rejects invalid PIN length', async () => {
    await expect(bt.pair('device-1', '123')).rejects.toThrow('PIN must be 6 digits');
  });

  it('rejects non-numeric PIN', async () => {
    await expect(bt.pair('device-1', 'abcdef')).rejects.toThrow('PIN must be 6 digits');
  });

  it('unpairs device', async () => {
    await bt.pair('device-1', '123456');
    await bt.unpair('device-1');
    expect(bt.isPaired('device-1')).toBe(false);
  });

  it('returns paired devices list', async () => {
    await bt.pair('d1', '123456');
    await bt.pair('d2', '654321');
    expect(bt.getPairedDevices()).toEqual(['d1', 'd2']);
  });

  it('scans for devices', async () => {
    const devices = await bt.scan();
    expect(Array.isArray(devices)).toBe(true);
  });

  it('adds and scans discovered devices', async () => {
    bt.addDiscoveredDevice({ id: 'd1', name: 'Phone', rssi: -50, paired: false });
    const devices = await bt.scan();
    expect(devices).toHaveLength(1);
    expect(devices[0]?.name).toBe('Phone');
  });
});

// ============================================================
// NetworkDiscovery
// ============================================================

describe('NetworkDiscovery', () => {
  let nd: NetworkDiscovery;

  beforeEach(() => {
    nd = new NetworkDiscovery();
  });

  it('registers and discovers devices', async () => {
    nd.registerDevice({ ip: '192.168.1.10', port: 8080, name: 'Desktop', type: 'desktop' });
    const devices = await nd.discover(8080);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.ip).toBe('192.168.1.10');
  });

  it('filters by port', async () => {
    nd.registerDevice({ ip: '192.168.1.10', port: 8080, name: 'A', type: 'desktop' });
    nd.registerDevice({ ip: '192.168.1.11', port: 3000, name: 'B', type: 'mobile' });
    const devices = await nd.discover(8080);
    expect(devices).toHaveLength(1);
  });

  it('removes device', () => {
    nd.registerDevice({ ip: '192.168.1.10', port: 8080, name: 'A', type: 'desktop' });
    nd.removeDevice('192.168.1.10');
    expect(nd.getDevice('192.168.1.10')).toBeUndefined();
  });

  it('gets all devices', () => {
    nd.registerDevice({ ip: '1.1.1.1', port: 8080, name: 'A', type: 'desktop' });
    nd.registerDevice({ ip: '2.2.2.2', port: 3000, name: 'B', type: 'mobile' });
    expect(nd.getAllDevices()).toHaveLength(2);
  });
});

// ============================================================
// PushNotificationBridge
// ============================================================

describe('PushNotificationBridge', () => {
  let bridge: PushNotificationBridge;

  beforeEach(() => {
    bridge = new PushNotificationBridge();
  });

  it('enqueues and dequeues notifications', () => {
    bridge.enqueue({ title: 'Hello', body: 'World', priority: 'normal' });
    expect(bridge.size()).toBe(1);
    const n = bridge.dequeue();
    expect(n?.title).toBe('Hello');
    expect(bridge.size()).toBe(0);
  });

  it('returns undefined when empty', () => {
    expect(bridge.dequeue()).toBeUndefined();
  });

  it('peeks without removing', () => {
    bridge.enqueue({ title: 'A', body: 'B', priority: 'high' });
    expect(bridge.peek()?.title).toBe('A');
    expect(bridge.size()).toBe(1);
  });

  it('clears all notifications', () => {
    bridge.enqueue({ title: 'A', body: 'B', priority: 'low' });
    bridge.enqueue({ title: 'C', body: 'D', priority: 'high' });
    bridge.clear();
    expect(bridge.size()).toBe(0);
  });
});

// ============================================================
// detectCapabilities
// ============================================================

describe('detectCapabilities', () => {
  it('detects Android', () => {
    const caps = detectCapabilities('Mozilla/5.0 (Linux; Android 13)');
    expect(caps.os).toBe('android');
    expect(caps.hasBluetooth).toBe(true);
    expect(caps.hasGPS).toBe(true);
  });

  it('detects iOS', () => {
    const caps = detectCapabilities('Mozilla/5.0 (iPhone; CPU OS 17_0)');
    expect(caps.os).toBe('ios');
    expect(caps.hasBluetooth).toBe(true);
  });

  it('detects unknown OS', () => {
    const caps = detectCapabilities('Mozilla/5.0 (Windows NT 10.0)');
    expect(caps.os).toBe('unknown');
    expect(caps.hasBluetooth).toBe(false);
  });

  it('uses custom screen size', () => {
    const caps = detectCapabilities('Android', { width: 1080, height: 1920 });
    expect(caps.screenSize).toEqual({ width: 1080, height: 1920 });
  });

  it('uses default screen size', () => {
    const caps = detectCapabilities('Android');
    expect(caps.screenSize).toEqual({ width: 360, height: 640 });
  });
});
