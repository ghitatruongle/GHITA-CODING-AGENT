// ==============================================================================
// GHITA CODING AGENT — Socket.io Client Service
// Desktop ↔ Mobile real-time communication
// ==============================================================================

import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '@ghita/shared';
import type { ConnectionState, ChatMessage } from '../types';
import { clearAuthToken, getAuthToken, getDeviceId, saveAuthToken } from './storageService';
import { assertSafeServerAddress } from './serverAddress';

// --- Event callback types ---
export interface SocketCallbacks {
  onConnectionChange?: (state: ConnectionState) => void;
  onScreenshot?: (imageBase64: string) => void;
  onChatResponse?: (message: ChatMessage) => void;
  onError?: (error: string) => void;
  onPairConfirm?: (deviceName: string) => void;
  onStatusUpdate?: (status: Record<string, unknown>) => void;
  onApprovalRequest?: (data: { id: string; command: string }) => void;
  onResumeApprovalRequest?: (data: {
    runId: string;
    pendingTools: string[];
    message: string;
  }) => void;
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
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private languageListeners: ((lang: string) => void)[] = [];
  // Pairing rate limiting
  private pairingFailCount = 0;
  private pairingCooldownUntil = 0;

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

  async connect(serverAddress: string): Promise<void> {
    assertSafeServerAddress(serverAddress);
    // Dispose only the old transport. Do not call disconnect() here because it
    // deliberately clears the credentials that this reconnect is about to use.
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    // Load the secure token and the stable installation ID before the handshake.
    try {
      [this.authToken, this.deviceId] = await Promise.all([getAuthToken(), getDeviceId()]);
    } catch (err) {
      console.warn('[SocketService] Failed to load pairing credentials:', err);
    }

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

    this.setConnectionState('connecting');
    this.reconnectAttempts = 0;

    this.socket = io(serverAddress, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      // v0.4.9 C1: reconnect indefinitely with exponential backoff + jitter so
      // a transient network drop (walking out of Wi-Fi range) recovers on its
      // own instead of giving up after a fixed number of tries.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 10000,
      forceNew: true,
      // Authentication is completed in the Socket.IO handshake. Unpaired
      // clients receive only an isolated pairing channel.
      auth: this.authToken
        ? { token: this.authToken, deviceId: this.deviceId }
        : { pairing: true, deviceId: this.deviceId },
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

    // Rate limiting: lock out after 5 failed attempts for 5 minutes
    const now = Date.now();
    if (now < this.pairingCooldownUntil) {
      const remainingSec = Math.ceil((this.pairingCooldownUntil - now) / 1000);
      this.callbacks.onError?.(`Too many attempts. Try again in ${remainingSec}s`);
      return;
    }

    this.setConnectionState('pairing');
    this.lastPairingCode = code;
    // C5: Token sent via socket.io handshake auth, not in event payload
    if (this.connectionType === 'cloud') {
      this.socket.emit('pair_mobile', { pairingCode: code });
    } else {
      this.socket.emit(SOCKET_EVENTS.PAIR, {
        code,
        deviceId: deviceId ?? this.deviceId,
        timestamp: Date.now(),
      });
    }
  }

  /** Call when pairing fails to track rate limit */
  onPairingFailed(): void {
    this.pairingFailCount++;
    if (this.pairingFailCount >= 5) {
      this.pairingCooldownUntil = Date.now() + 5 * 60 * 1000;
      this.pairingFailCount = 0;
    }
  }

  /** Reset pairing rate limit on success */
  onPairingSuccess(): void {
    this.pairingFailCount = 0;
    this.pairingCooldownUntil = 0;
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

  resumeAgentRun(runId: string): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit('agent_run', {
      resumeRunId: runId,
      resumeConfirmed: true,
    });
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
      this.socket.timeout(10000).emit(
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
        // deep-review fix (L12): bound the health probe so a hanging server
        // cannot pile up in-flight fetches.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        let response: Response;
        try {
          response = await fetch(`${this.lastLocalAddress}/health`, {
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
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
      if (this.connectionType === 'cloud') {
        if (this.lastPairingCode) {
          this.setConnectionState('pairing');
          this.socket?.emit('pair_mobile', {
            pairingCode: this.lastPairingCode,
            deviceId: this.deviceId,
          });
        } else {
          this.setConnectionState('disconnected');
        }
      } else {
        if (this.authToken && this.deviceId) {
          // The server authenticated this device during the handshake and will
          // emit PAIR_CONFIRM without requiring the secret in an event payload.
          this.setConnectionState('pairing');
        } else if (this.lastPairingCode) {
          this.setConnectionState('pairing');
          this.socket?.emit(SOCKET_EVENTS.PAIR, {
            code: this.lastPairingCode,
            deviceId: this.deviceId,
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
        if (this.socket) {
          this.socket.auth = {
            token: this.authToken,
            deviceId: this.deviceId,
          };
        }
        this.setConnectionState('connected');
        this.onPairingSuccess();

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

    this.socket.on(
      'agent_resume_confirmation_required',
      (data: { runId: string; pendingTools?: string[]; message?: string }) => {
        this.callbacks.onResumeApprovalRequest?.({
          runId: data.runId,
          pendingTools: data.pendingTools ?? [],
          message: data.message ?? 'Pending tools may be executed again.',
        });
      },
    );

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
        this.authToken = null;
        void clearAuthToken();
        if (this.socket) {
          this.socket.auth = { pairing: true, deviceId: this.deviceId };
        }
        this.setConnectionState('disconnected');
      }
      this.callbacks.onError?.(data.message ?? 'Unknown error from server');
    });

    // C18: Action required (tool approval)
    this.socket.on('action_required', (data: { id: string; command: string }) => {
      this.callbacks.onApprovalRequest?.(data);
    });

    // C19: File approval required
    this.socket.on(
      SOCKET_EVENTS.REQUIRE_FILE_APPROVAL,
      (data: { id: string; path: string; action: string }) => {
        this.callbacks.onApprovalRequest?.({
          id: data.id,
          command: `[File] ${data.action}: ${data.path}`,
        });
      },
    );

    // H3: Chat start event
    this.socket.on('chat_start', () => {
      // Prepare for incoming AI response
    });

    // Ping-pong keepalive
    this.socket.on(SOCKET_EVENTS.PING, () => {
      this.socket?.emit(SOCKET_EVENTS.PONG, { timestamp: Date.now() });
    });
  }
}

// Singleton instance — survive React Native Fast Refresh (HMR) by stashing
// the instance on globalThis so re-evaluating this module doesn't create
// a fresh (disconnected) SocketService each time.
const GLOBAL_KEY = '__ghita_socket_service__';
export const socketService: SocketService =
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] as SocketService) ??
  (() => {
    const instance = new SocketService();
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = instance;
    return instance;
  })();
