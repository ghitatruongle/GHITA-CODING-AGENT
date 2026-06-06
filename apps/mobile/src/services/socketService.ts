// ==============================================================================
// GHITA CODING AGENT — Socket.io Client Service
// Desktop ↔ Mobile real-time communication
// ==============================================================================

import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '@ghita/shared';
import type { ConnectionState, ChatMessage } from '../types';
import { clearAuthToken, getAuthToken, saveAuthToken } from './storageService';

// --- Event callback types ---
export interface SocketCallbacks {
  onConnectionChange?: (state: ConnectionState) => void;
  onScreenshot?: (imageBase64: string) => void;
  onChatResponse?: (message: ChatMessage) => void;
  onError?: (error: string) => void;
  onPairConfirm?: (deviceName: string) => void;
  onStatusUpdate?: (status: Record<string, unknown>) => void;
  onApprovalRequest?: (data: { id: string; command: string }) => void;
  onCostTelemetry?: (data: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    limitUsd: number;
  }) => void;
}

// Intentionally module-level to persist across re-renders for unique AI message ID generation
let aiMsgCounter = 0;

// --- Socket Service ---
export class SocketService {
  public connectionType: 'local' | 'cloud' | null = null;
  private lastPairingCode: string | null = null;
  private socket: Socket | null = null;
  private callbacks: SocketCallbacks = {};
  private _connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private deviceId: string | null = null;
  private authToken: string | null = null;
  private lastUrl: string | null = null;
  private lastLocalAddress: string | null = null;
  /** Reserved for future cloud failover re-enablement (currently disabled) */
  private cloudAddress: string = 'https://ghita-relay-server.onrender.com';
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private languageListeners: ((lang: string) => void)[] = [];

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get isConnected(): boolean {
    return this._connectionState === 'connected';
  }

  get isSocketConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getLastUrl(): string | null {
    return this.lastUrl;
  }

  /**
   * Register event callbacks (replaces all existing callbacks)
   */
  setCallbacks(callbacks: SocketCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Clear all registered callbacks
   */
  clearCallbacks(): void {
    this.callbacks = {};
  }

  connect(serverAddress: string): void {
    // Prefetch auth token asynchronously to avoid race conditions during pair/reconnect
    void getAuthToken().then((token) => {
      this.authToken = token;
    });

    // Save last URL for auto-reconnect
    this.lastUrl = serverAddress;

    // Auto-detect connectionType
    if (
      serverAddress.includes('onrender.com') ||
      serverAddress.includes('render.com') ||
      serverAddress.includes('cloud')
    ) {
      this.connectionType = 'cloud';
    } else {
      this.connectionType = 'local';
      this.lastLocalAddress = serverAddress;
    }

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
    this.stopLocalHealthCheck();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.deviceId = null;
    this.authToken = null;
    this.lastPairingCode = null;
    this.connectionType = null;
    this.setConnectionState('disconnected');
    this.reconnectAttempts = 0;
    // Keep callbacks so reconnect can reuse them
  }

  sendPairingCode(code: string, deviceId?: string): void {
    if (!this.socket) return;
    this.setConnectionState('pairing');
    this.lastPairingCode = code;
    const authToken = this.authToken;
    if (this.connectionType === 'cloud') {
      this.socket.emit('pair_mobile', { pairingCode: code });
    } else {
      this.socket.emit(SOCKET_EVENTS.PAIR, { code, deviceId, authToken, timestamp: Date.now() });
    }
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
   * Send touch coordinates to desktop
   * @param rx Percentage width (0-1)
   * @param ry Percentage height (0-1)
   * @param button Mouse button ('left' | 'right' | 'middle')
   * @param action Touch action ('click' | 'move')
   */
  sendTouch(
    rx: number,
    ry: number,
    button: 'left' | 'right' | 'middle' = 'left',
    action: 'click' | 'move' = 'click',
  ): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.MOBILE_TOUCH, {
      rx,
      ry,
      button,
      action,
      timestamp: Date.now(),
    });
  }

  /**
   * Send specific terminal command approval
   */
  sendApproveCommand(id: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.APPROVE_COMMAND, { id });
  }

  /**
   * Send specific terminal command rejection
   */
  sendRejectCommand(id: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.REJECT_COMMAND, { id });
  }

  /**
   * Send command to desktop
   */
  sendCommand(action: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.COMMAND, {
      action,
      timestamp: Date.now(),
    });
  }

  /**
   * List available skills from desktop
   */
  listSkills(): Promise<{
    success: boolean;
    skills?: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      enabled: boolean;
    }>;
    error?: string;
  }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }
      this.socket
        .timeout(10000)
        .emit(
          'list_skills',
          {},
          (
            err: unknown,
            response: {
              success: boolean;
              skills?: Array<{
                id: string;
                name: string;
                description: string;
                category: string;
                enabled: boolean;
              }>;
              error?: string;
            },
          ) => {
            if (err) {
              resolve({ success: false, error: 'Request timed out' });
            } else {
              resolve(response);
            }
          },
        );
    });
  }

  /**
   * Run a skill on desktop
   */
  runSkill(
    skillId: string,
    input: Record<string, unknown> = {},
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }
      this.socket
        .timeout(30000)
        .emit(
          'run_skill',
          { id: skillId, input },
          (err: unknown, response: { success: boolean; result?: unknown; error?: string }) => {
            if (err) {
              resolve({ success: false, error: 'Request timed out' });
            } else {
              resolve(response);
            }
          },
        );
    });
  }

  /**
   * Register listener for language synchronization
   */
  onLanguageSync(callback: (lang: string) => void): () => void {
    this.languageListeners.push(callback);
    return () => {
      this.languageListeners = this.languageListeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Broadcast language change to desktop
   */
  sendSyncLanguage(language: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit(SOCKET_EVENTS.SYNC_LANGUAGE, { language });
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

  private startLocalHealthCheck(): void {
    if (this.healthCheckInterval) return;
    if (!this.lastLocalAddress) return;

    this.healthCheckInterval = setInterval(async () => {
      if (!this.lastLocalAddress) return;
      try {
        const response = await fetch(`${this.lastLocalAddress}/health`);
        if (response.ok) {
          console.info('[SocketService] Local LAN server is back online! Recovering connection...');
          this.stopLocalHealthCheck();
          if (this.connectionType === 'cloud') {
            this.callbacks.onError?.('Local LAN back online. Recovering direct connection...');
            this.connect(this.lastLocalAddress);
          }
        }
      } catch (err) {
        console.warn('[SocketService] Local health check failed:', err);
      }
    }, 10000);
  }

  private stopLocalHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private registerEventHandlers(): void {
    if (!this.socket) return;

    // Connection
    this.socket.on(SOCKET_EVENTS.CONNECT, () => {
      this.reconnectAttempts = 0;
      const authToken = this.authToken;
      if (this.connectionType === 'cloud') {
        if (this.lastPairingCode) {
          this.setConnectionState('pairing');
          this.socket?.emit('pair_mobile', {
            pairingCode: this.lastPairingCode,
            deviceId: this.deviceId,
            authToken: authToken,
          });
        } else {
          this.setConnectionState('disconnected');
        }
      } else {
        if (this.deviceId) {
          this.setConnectionState('pairing');
          this.socket?.emit(SOCKET_EVENTS.PAIR, {
            deviceId: this.deviceId,
            authToken,
            timestamp: Date.now(),
          });
        } else {
          this.setConnectionState('disconnected');
        }
      }
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
      // Keep connectionState as 'connecting' to let Socket.io continuously retry reconnection indefinitely
      this.setConnectionState('connecting');
      this.callbacks.onError?.(
        `Connecting retry attempt ${this.reconnectAttempts}: ${err.message}`,
      );

      // Failover state machine: local -> cloud (tạm vô hiệu hóa — Cloud Relay đã bị xóa)
      // if (this.connectionType === 'local' && this.reconnectAttempts >= 3) {
      //   console.log('[SocketService] Local LAN disconnected. Switching to Cloud Relay...');
      //   this.callbacks.onError?.('Local LAN disconnected. Switching to Cloud Relay...');
      //   this.connect(this.cloudAddress);
      //   this.startLocalHealthCheck();
      // }
    });

    // Pairing confirmation
    this.socket.on(
      SOCKET_EVENTS.PAIR_CONFIRM,
      (data: { deviceName?: string; deviceId?: string; authToken?: string }) => {
        if (data.deviceId) {
          this.deviceId = data.deviceId;
        } else if (this.connectionType === 'cloud') {
          this.deviceId = 'cloud_session';
        }
        if (data.authToken) {
          this.authToken = data.authToken;
          void saveAuthToken(data.authToken);
        }
        this.setConnectionState('connected');

        // Stop healthcheck once we successfully pair in local mode
        if (this.connectionType === 'local') {
          this.stopLocalHealthCheck();
        }

        this.callbacks.onPairConfirm?.(
          data.deviceName ?? (this.connectionType === 'cloud' ? 'Desktop (Cloud)' : 'Desktop'),
        );
      },
    );

    // Peer disconnected (Cloud mode fallback)
    this.socket.on('disconnect_peer', (data: { reason?: string }) => {
      this.setConnectionState('disconnected');
      this.callbacks.onError?.(data.reason ?? 'Desktop offline');
    });

    // Screenshot received
    this.socket.on(SOCKET_EVENTS.SCREEN_STREAM, (data: { image?: string }) => {
      if (data.image) {
        this.callbacks.onScreenshot?.(data.image);
      }
    });

    let streamingChatResponse = '';

    this.socket.on('chat_chunk', (data: { text?: string }) => {
      if (data.text) {
        streamingChatResponse += data.text;
      }
    });

    this.socket.on(
      'chat_done',
      (data: {
        text?: string;
        timestamp?: number;
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
          costUsd?: number;
          limitUsd?: number;
        };
      }) => {
        const text = data.text ?? streamingChatResponse;
        streamingChatResponse = '';

        if (data.usage) {
          this.callbacks.onCostTelemetry?.({
            inputTokens: data.usage.promptTokens ?? 0,
            outputTokens: data.usage.completionTokens ?? 0,
            totalTokens: data.usage.totalTokens ?? 0,
            costUsd: data.usage.costUsd ?? 0,
            limitUsd: data.usage.limitUsd ?? 5,
          });
        }

        if (text) {
          const message: ChatMessage = {
            id: `ai_${Date.now()}_${++aiMsgCounter}`,
            text,
            sender: 'ai',
            timestamp: data.timestamp ?? Date.now(),
          };
          this.callbacks.onChatResponse?.(message);
        }
      },
    );

    this.socket.on('chat_error', (data: { message?: string }) => {
      streamingChatResponse = '';
      this.callbacks.onError?.(data.message ?? 'Chat request failed');
    });

    // Chat response
    this.socket.on(SOCKET_EVENTS.CHAT, (data: { text?: string; timestamp?: number }) => {
      if (data.text) {
        const message: ChatMessage = {
          id: `ai_${Date.now()}_${++aiMsgCounter}`,
          text: data.text,
          sender: 'ai',
          timestamp: data.timestamp ?? Date.now(),
        };
        this.callbacks.onChatResponse?.(message);
      }
    });

    // Approval Request
    this.socket.on(SOCKET_EVENTS.REQUIRE_APPROVAL, (data: { id: string; command: string }) => {
      this.callbacks.onApprovalRequest?.(data);
    });

    // Cost Telemetry
    this.socket.on(
      SOCKET_EVENTS.COST_TELEMETRY,
      (data: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUsd: number;
        limitUsd: number;
      }) => {
        this.callbacks.onCostTelemetry?.(data);
      },
    );

    // Status update
    this.socket.on(SOCKET_EVENTS.STATUS, (data: Record<string, unknown>) => {
      this.callbacks.onStatusUpdate?.(data);
    });

    // Language Sync
    this.socket.on(SOCKET_EVENTS.SYNC_LANGUAGE, (data: { language: string }) => {
      if (data?.language) {
        this.languageListeners.forEach((cb) => cb(data.language));
      }
    });

    // Error from server
    this.socket.on(SOCKET_EVENTS.ERROR, (data: { message?: string }) => {
      if (data.message === 'Session expired. Please re-pair.') {
        this.deviceId = null;
        this.authToken = null;
        void clearAuthToken();
        this.setConnectionState('disconnected');
      }
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
