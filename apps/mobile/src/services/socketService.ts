// ==============================================================================
// GHITA CODING AGENT — Socket.io Client Service
// Desktop ↔ Mobile real-time communication
// ==============================================================================

import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@ghita/shared';
import type { ConnectionState, ChatMessage } from '../types';

// --- Event callback types ---
export interface SocketCallbacks {
  onConnectionChange?: (state: ConnectionState) => void;
  onScreenshot?: (imageBase64: string) => void;
  onChatResponse?: (message: ChatMessage) => void;
  onError?: (error: string) => void;
  onPairConfirm?: (deviceName: string) => void;
  onStatusUpdate?: (status: Record<string, unknown>) => void;
}

// --- Socket Service ---
export class SocketService {
  private socket: Socket | null = null;
  private callbacks: SocketCallbacks = {};
  private _connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get isConnected(): boolean {
    return this._connectionState === 'connected';
  }

  /**
   * Register event callbacks
   */
  setCallbacks(callbacks: SocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Connect to desktop server
   * @param serverAddress - e.g. "http://192.168.1.100:8080" or "http://10.0.2.2:8080" for emulator
   */
  connect(serverAddress: string): void {
    // Cleanup existing connection
    if (this.socket) {
      this.disconnect();
    }

    this.setConnectionState('connecting');
    this.reconnectAttempts = 0;

    this.socket = io(serverAddress, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 10000,
      forceNew: true,
    });

    this.registerEventHandlers();
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.setConnectionState('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Send pairing code to server
   */
  sendPairingCode(code: string): void {
    if (!this.socket) return;
    this.setConnectionState('pairing');
    this.socket.emit(SOCKET_EVENTS.PAIR, { code, timestamp: Date.now() });
  }

  /**
   * Send chat message / command to AI
   */
  sendChatMessage(text: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.CHAT, {
      text,
      timestamp: Date.now(),
    });
  }

  /**
   * Request screenshot from desktop
   */
  requestScreenshot(): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.SCREENSHOT, { timestamp: Date.now() });
  }

  /**
   * Send approval action
   */
  sendApprove(): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.APPROVE, { timestamp: Date.now() });
  }

  /**
   * Send rejection action
   */
  sendReject(): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.REJECT, { timestamp: Date.now() });
  }

  /**
   * Send command to desktop
   */
  sendCommand(command: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.COMMAND, {
      command,
      timestamp: Date.now(),
    });
  }

  /**
   * Wait for socket to reach 'connected' state
   * @param timeoutMs - Maximum wait time before rejecting
   */
  waitForConnect(timeoutMs = 10000): Promise<void> {
    if (this.isConnected) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timeout'));
      }, timeoutMs);

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.socket?.off(SOCKET_EVENTS.CONNECT, onConnect);
      };

      this.socket?.on(SOCKET_EVENTS.CONNECT, onConnect);
    });
  }

  // --- Private Methods ---

  private setConnectionState(state: ConnectionState): void {
    this._connectionState = state;
    this.callbacks.onConnectionChange?.(state);
  }

  private registerEventHandlers(): void {
    if (!this.socket) return;

    // Connection
    this.socket.on(SOCKET_EVENTS.CONNECT, () => {
      this.reconnectAttempts = 0;
      this.setConnectionState('connected');
    });

    // Disconnection
    this.socket.on(SOCKET_EVENTS.DISCONNECT, (reason: string) => {
      if (reason === 'io server disconnect') {
        // Server forced disconnect — attempt reconnect
        this.socket?.connect();
      }
      this.setConnectionState('disconnected');
    });

    // Connection error
    this.socket.on('connect_error', (err: Error) => {
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setConnectionState('error');
        this.callbacks.onError?.(`Connection failed after ${this.maxReconnectAttempts} attempts: ${err.message}`);
      } else {
        this.setConnectionState('connecting');
      }
    });

    // Pairing confirmation
    this.socket.on(SOCKET_EVENTS.PAIR_CONFIRM, (data: { deviceName?: string }) => {
      this.setConnectionState('connected');
      this.callbacks.onPairConfirm?.(data.deviceName ?? 'Desktop');
    });

    // Screenshot received
    this.socket.on(SOCKET_EVENTS.SCREEN_STREAM, (data: { image?: string }) => {
      if (data.image) {
        this.callbacks.onScreenshot?.(data.image);
      }
    });

    // Chat response
    this.socket.on(SOCKET_EVENTS.CHAT, (data: { text?: string; timestamp?: number }) => {
      if (data.text) {
        const message: ChatMessage = {
          id: `ai_${Date.now()}`,
          text: data.text,
          sender: 'ai',
          timestamp: data.timestamp ?? Date.now(),
        };
        this.callbacks.onChatResponse?.(message);
      }
    });

    // Status update
    this.socket.on(SOCKET_EVENTS.STATUS, (data: Record<string, unknown>) => {
      this.callbacks.onStatusUpdate?.(data);
    });

    // Error from server
    this.socket.on(SOCKET_EVENTS.ERROR, (data: { message?: string }) => {
      this.callbacks.onError?.(data.message ?? 'Unknown error from server');
    });

    // Ping-pong keepalive
    this.socket.on(SOCKET_EVENTS.PING, () => {
      this.socket?.emit(SOCKET_EVENTS.PONG, { timestamp: Date.now() });
    });
  }
}

// Singleton instance
export const socketService = new SocketService();
