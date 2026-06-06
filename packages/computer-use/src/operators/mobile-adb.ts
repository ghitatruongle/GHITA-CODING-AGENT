// ==============================================================================
// GHITA CODING AGENT - Mobile ADB Operator (Phase 19 — Update 0.0.3)
// ==============================================================================
// Mobile device control via Android Debug Bridge (ADB).
// - Screenshot via `adb exec-out screencap -p`
// - Touch input: tap, swipe, long-press, pinch
// - Device list and connection management
// - Tauri command bridge interface (frontend-callable)
// ==============================================================================

import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

// ----- Types -----

export interface AdbDevice {
  /** Device serial (e.g. "emulator-5554" or "ABC123") */
  serial: string;
  /** "device" | "unauthorized" | "offline" */
  state: 'device' | 'unauthorized' | 'offline' | 'unknown';
  /** Product model (e.g. "Pixel 6") */
  product?: string;
  /** "usb" | "tcp" */
  transport?: 'usb' | 'tcp';
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface TouchAction {
  type: 'tap' | 'swipe' | 'long-press' | 'pinch';
  x: number;
  y: number;
  /** For swipe: end x,y */
  endX?: number;
  endY?: number;
  /** For long-press: duration in ms (default 1000) */
  durationMs?: number;
  /** For pinch: zoom in or out */
  zoom?: 'in' | 'out';
  /** For pinch: distance from center (default 100) */
  distance?: number;
}

export interface ScreenshotResult {
  /** PNG buffer of the screen capture */
  png: Buffer;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Timestamp of capture */
  capturedAt: number;
}

// ----- Operator -----

export class MobileAdbOperator {
  private readonly adbPath: string;
  private currentDevice: string | null = null;

  constructor(adbPath = 'adb') {
    this.adbPath = adbPath;
  }

  /** List connected devices via `adb devices -l` */
  async listDevices(): Promise<AdbDevice[]> {
    const { stdout } = await execAsync(`${this.adbPath} devices -l`);
    const lines = stdout.split('\n').slice(1); // skip header
    const devices: AdbDevice[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const serial = parts[0];
      const stateRaw = parts[1];
      if (!serial || !stateRaw) continue;
      const state = (['device', 'unauthorized', 'offline'] as const).find((s) => s === stateRaw) ?? 'unknown';
      const product = parts.find((p) => p.startsWith('product:'))?.split(':')[1];
      const transport = parts.find((p) => p.startsWith('transport_id:')) ? 'usb' : 'usb';
      devices.push({ serial, state, product, transport: transport as 'usb' | 'tcp' });
    }
    return devices;
  }

  /** Select device for subsequent operations (defaults to first connected) */
  async selectDevice(serial?: string): Promise<string> {
    const devices = await this.listDevices();
    const ready = devices.filter((d) => d.state === 'device');
    if (ready.length === 0) throw new Error('No ready ADB device found');
    const target = serial ? ready.find((d) => d.serial === serial) : ready[0];
    if (!target) throw new Error(`Device ${serial ?? '(none)'} not found or not ready`);
    this.currentDevice = target.serial;
    return target.serial;
  }

  /** Get current device serial (or null if none selected) */
  getDevice(): string | null {
    return this.currentDevice;
  }

  /** Get screen size for the current device */
  async getScreenSize(): Promise<ScreenSize> {
    const dev = this.requireDevice();
    const { stdout } = await execAsync(`${this.adbPath} -s ${dev} shell wm size`);
    // Output: "Physical size: 1080x2400"
    const match = stdout.match(/(\d+)x(\d+)/);
    if (!match) throw new Error(`Failed to parse screen size: ${stdout}`);
    const widthStr = match[1];
    const heightStr = match[2];
    if (!widthStr || !heightStr) throw new Error(`Failed to parse screen size parts: ${stdout}`);
    return { width: parseInt(widthStr, 10), height: parseInt(heightStr, 10) };
  }

  /** Capture screenshot as PNG buffer */
  async screenshot(): Promise<ScreenshotResult> {
    const dev = this.requireDevice();
    const { stdout } = await execAsync(`${this.adbPath} -s ${dev} exec-out screencap -p`, {
      encoding: 'buffer',
      maxBuffer: 50 * 1024 * 1024, // 50 MB cap
    });
    const size = await this.getScreenSize();
    return {
      png: stdout as Buffer,
      width: size.width,
      height: size.height,
      capturedAt: Date.now(),
    };
  }

  /** Execute a touch action */
  async touch(action: TouchAction): Promise<void> {
    const dev = this.requireDevice();
    switch (action.type) {
      case 'tap': {
        await execAsync(`${this.adbPath} -s ${dev} shell input tap ${action.x} ${action.y}`);
        return;
      }
      case 'swipe': {
        if (action.endX === undefined || action.endY === undefined) {
          throw new Error('swipe requires endX and endY');
        }
        const duration = action.durationMs ?? 300;
        await execAsync(
          `${this.adbPath} -s ${dev} shell input swipe ${action.x} ${action.y} ${action.endX} ${action.endY} ${duration}`,
        );
        return;
      }
      case 'long-press': {
        const duration = action.durationMs ?? 1000;
        // Long-press = swipe to same coordinate with long duration
        await execAsync(
          `${this.adbPath} -s ${dev} shell input swipe ${action.x} ${action.y} ${action.x} ${action.y} ${duration}`,
        );
        return;
      }
      case 'pinch': {
        // Pinch = two simultaneous swipes from/to points
        const distance = action.distance ?? 100;
        const cx = action.x;
        const cy = action.y;
        const zoomOut = action.zoom === 'out';
        const factor = zoomOut ? -1 : 1;
        // Simplified: two parallel swipes via background process
        const cmd1 = `${this.adbPath} -s ${dev} shell input swipe ${cx - distance} ${cy} ${cx - distance * factor} ${cy} 300 &`;
        const cmd2 = `${this.adbPath} -s ${dev} shell input swipe ${cx + distance} ${cy} ${cx + distance * factor} ${cy} 300`;
        await execAsync(`${cmd1} ${cmd2}`);
        return;
      }
    }
  }

  /** Convenience: tap a coordinate */
  async tap(x: number, y: number): Promise<void> {
    return this.touch({ type: 'tap', x, y });
  }

  /** Convenience: swipe from (x1,y1) to (x2,y2) */
  async swipe(x1: number, y1: number, x2: number, y2: number, durationMs = 300): Promise<void> {
    return this.touch({ type: 'swipe', x: x1, y: y1, endX: x2, endY: y2, durationMs });
  }

  /** Push a file to device (e.g. install APK) */
  async pushFile(localPath: string, remotePath: string): Promise<void> {
    const dev = this.requireDevice();
    await execAsync(`${this.adbPath} -s ${dev} push "${localPath}" "${remotePath}"`);
  }

  /** Pull a file from device */
  async pullFile(remotePath: string, localPath: string): Promise<void> {
    const dev = this.requireDevice();
    await execAsync(`${this.adbPath} -s ${dev} pull "${remotePath}" "${localPath}"`);
  }

  /** Run a shell command on device */
  async shell(command: string): Promise<string> {
    const dev = this.requireDevice();
    const { stdout } = await execAsync(`${this.adbPath} -s ${dev} shell ${command}`);
    return stdout;
  }

  private requireDevice(): string {
    if (!this.currentDevice) {
      throw new Error('No device selected — call selectDevice() first');
    }
    return this.currentDevice;
  }
}

// ----- Tauri Command Bridge (frontend-callable) -----

/**
 * Tauri command shape — frontend calls invoke('mobile_adb_<cmd>', { ... }).
 * These wrappers marshal errors into Tauri-compatible responses.
 */
export interface TauriCommandResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function tauriListDevices(adbPath?: string): Promise<TauriCommandResult<AdbDevice[]>> {
  try {
    const op = new MobileAdbOperator(adbPath);
    const devices = await op.listDevices();
    return { ok: true, data: devices };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function tauriScreenshot(serial?: string, adbPath?: string): Promise<TauriCommandResult<string>> {
  try {
    const op = new MobileAdbOperator(adbPath);
    await op.selectDevice(serial);
    const result = await op.screenshot();
    // Return base64 data URL for frontend <img src=...>
    const base64 = result.png.toString('base64');
    return { ok: true, data: `data:image/png;base64,${base64}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function tauriTap(x: number, y: number, serial?: string, adbPath?: string): Promise<TauriCommandResult<void>> {
  try {
    const op = new MobileAdbOperator(adbPath);
    await op.selectDevice(serial);
    await op.tap(x, y);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function tauriSwipe(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  durationMs = 300,
  serial?: string,
  adbPath?: string,
): Promise<TauriCommandResult<void>> {
  try {
    const op = new MobileAdbOperator(adbPath);
    await op.selectDevice(serial);
    await op.swipe(x1, y1, x2, y2, durationMs);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Suppress unused import warnings */
export const _internal = { spawn, exec, writeFile, mkdtemp, rm, join, tmpdir, execAsync };
