// ==============================================================================
// GHITA CODING AGENT - Communication Server
// Socket.io server for Desktop ↔ Mobile real-time communication
// ==============================================================================

import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { SOCKET_EVENTS, generateId } from '@ghita/shared';
import type { DeviceInfo } from '@ghita/shared';
import { PairingManager } from './pairing.js';
import { ScreenCapture } from './screen-capture.js';
import type {
  ServerConfig,
  ServerEvents,
  PairedDevice,
  CommandPayload,
} from './types.js';

const DEFAULT_CONFIG: ServerConfig = {
  port: 8080,
  host: '0.0.0.0',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
};

export class CommunicationServer {
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer | null = null;
  private config: ServerConfig;
  private events: ServerEvents = {};
  private connectedDevices = new Map<string, PairedDevice>();

  readonly pairing: PairingManager;
  readonly screenCapture: ScreenCapture;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pairing = new PairingManager();
    this.screenCapture = new ScreenCapture();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start the Socket.io server
   */
  async start(): Promise<void> {
    if (this.io) {
      console.warn('[CommServer] Server already running');
      return;
    }

    this.httpServer = createServer();

    this.io = new SocketIOServer(this.httpServer, {
      cors: this.config.cors,
      transports: ['websocket', 'polling'],
      pingInterval: 25000,
      pingTimeout: 20000,
    });

    this.registerSocketHandlers();

    // Start pairing auto-refresh
    this.pairing.startAutoRefresh((newCode) => {
      console.log(`[CommServer] Pairing code refreshed: ${newCode}`);
    });

    return new Promise<void>((resolve, reject) => {
      if (!this.httpServer) return reject(new Error('HTTP server not initialized'));

      this.httpServer.on('error', (err) => {
        console.error('[CommServer] Server error:', err.message);
        this.events.onError?.(err);
        reject(err);
      });

      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(
          `[CommServer] 🚀 Socket.io server listening on ${this.config.host}:${this.config.port}`,
        );
        console.log(`[CommServer] 🔑 Pairing code: ${this.pairing.getCode()}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    this.screenCapture.dispose();
    this.pairing.dispose();

    // Disconnect all clients
    if (this.io) {
      this.io.disconnectSockets(true);
      this.io.close();
      this.io = null;
    }

    if (this.httpServer) {
      return new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          console.log('[CommServer] Server stopped');
          this.httpServer = null;
          resolve();
        });
      });
    }

    this.connectedDevices.clear();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Register event callbacks
   */
  setCallbacks(events: ServerEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Get list of connected devices
   */
  getConnectedDevices(): DeviceInfo[] {
    return [...this.connectedDevices.values()].map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      connected: d.connected,
      lastSeen: d.lastSeen,
    }));
  }

  /**
   * Get number of connected devices
   */
  get deviceCount(): number {
    return this.connectedDevices.size;
  }

  /**
   * Check if server is running
   */
  get isRunning(): boolean {
    return this.io !== null;
  }

  /**
   * Get server address info
   */
  getAddress(): { host: string; port: number } {
    return { host: this.config.host ?? '0.0.0.0', port: this.config.port };
  }

  /**
   * Send a screenshot to all connected devices
   */
  async broadcastScreenshot(): Promise<void> {
    if (!this.io || this.connectedDevices.size === 0) return;

    try {
      const imageBase64 = await this.screenCapture.captureScreen();
      this.io.emit(SOCKET_EVENTS.SCREEN_STREAM, {
        image: imageBase64,
        timestamp: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[CommServer] Screenshot broadcast failed:', message);
    }
  }

  /**
   * Send a chat message to all connected devices
   */
  broadcastChat(text: string): void {
    if (!this.io) return;
    this.io.emit(SOCKET_EVENTS.CHAT, {
      text,
      timestamp: Date.now(),
    });
  }

  /**
   * Send status update to all connected devices
   */
  broadcastStatus(status: Record<string, unknown>): void {
    if (!this.io) return;
    this.io.emit(SOCKET_EVENTS.STATUS, status);
  }

  // ===========================================================================
  // Socket Event Handlers
  // ===========================================================================

  private registerSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      console.log(`[CommServer] New connection: ${socket.id}`);

      // --- Pairing ---
      socket.on(SOCKET_EVENTS.PAIR, (data: { code?: string; timestamp?: number }) => {
        this.handlePairing(socket, data);
      });

      // --- Commands ---
      socket.on(SOCKET_EVENTS.COMMAND, (data: CommandPayload) => {
        const device = this.findDeviceBySocket(socket.id);
        if (device) {
          device.lastSeen = Date.now();
          this.events.onCommand?.(device.id, data);
        }
      });

      // --- Chat ---
      socket.on(SOCKET_EVENTS.CHAT, (data: { text?: string }) => {
        const device = this.findDeviceBySocket(socket.id);
        if (device && data.text) {
          device.lastSeen = Date.now();
          this.events.onChat?.(device.id, data.text);
        }
      });

      // --- Screenshot Request ---
      socket.on(SOCKET_EVENTS.SCREENSHOT, () => {
        void this.handleScreenshotRequest(socket);
      });

      // --- Approve / Reject ---
      socket.on(SOCKET_EVENTS.APPROVE, () => {
        const device = this.findDeviceBySocket(socket.id);
        if (device) {
          device.lastSeen = Date.now();
          this.events.onApprove?.(device.id);
        }
      });

      socket.on(SOCKET_EVENTS.REJECT, () => {
        const device = this.findDeviceBySocket(socket.id);
        if (device) {
          device.lastSeen = Date.now();
          this.events.onReject?.(device.id);
        }
      });

      // --- Ping/Pong (keepalive) ---
      socket.on(SOCKET_EVENTS.PONG, () => {
        const device = this.findDeviceBySocket(socket.id);
        if (device) {
          device.lastSeen = Date.now();
        }
      });

      // --- Disconnect ---
      socket.on(SOCKET_EVENTS.DISCONNECT, (reason: string) => {
        const device = this.findDeviceBySocket(socket.id);
        if (device) {
          console.log(`[CommServer] Device disconnected: ${device.name} (${reason})`);
          this.connectedDevices.delete(device.id);
          this.events.onDeviceDisconnected?.(device.id);
        }
      });
    });
  }

  private handlePairing(socket: Socket, data: { code?: string; timestamp?: number }): void {
    const code = data.code?.toUpperCase();

    if (!code) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Pairing code is required' });
      return;
    }

    if (!this.pairing.validate(code)) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid or expired pairing code' });
      return;
    }

    // Create paired device
    const device: PairedDevice = {
      id: generateId('device'),
      name: `Mobile-${socket.id.slice(0, 6)}`,
      platform: 'android',
      connected: true,
      lastSeen: Date.now(),
      socketId: socket.id,
      pairedAt: Date.now(),
    };

    this.connectedDevices.set(device.id, device);

    // Confirm pairing to mobile
    socket.emit(SOCKET_EVENTS.PAIR_CONFIRM, {
      deviceName: 'GHITA Desktop',
      deviceId: device.id,
    });

    // Generate new pairing code after successful pair (security)
    this.pairing.regenerate();

    console.log(`[CommServer] ✅ Device paired: ${device.name} (${device.id})`);
    this.events.onDeviceConnected?.(device);
  }

  private async handleScreenshotRequest(socket: Socket): Promise<void> {
    try {
      const imageBase64 = await this.screenCapture.captureScreen();
      socket.emit(SOCKET_EVENTS.SCREEN_STREAM, {
        image: imageBase64,
        timestamp: Date.now(),
      });
    } catch {
      socket.emit(SOCKET_EVENTS.ERROR, {
        message: 'Failed to capture screenshot',
      });
    }
  }

  private findDeviceBySocket(socketId: string): PairedDevice | undefined {
    for (const device of this.connectedDevices.values()) {
      if (device.socketId === socketId) {
        return device;
      }
    }
    return undefined;
  }
}
