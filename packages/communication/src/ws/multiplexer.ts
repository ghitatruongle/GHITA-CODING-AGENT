// ==============================================================================
// GHITA CODING AGENT - WebSocket Multiplexer (Phase 29)
// Single WS connection for multiple streams with channel demux
// ==============================================================================

import type {
  WsMultiplexerConfig,
  WsConnectionState,
  WsConnectionEvent,
  WsConnectionListener,
  ChannelMessage,
  ChannelSubscriptionOptions,
  WsMuxStats,
  BinaryFrameHeader,
} from './types.js';
import { WsChannel } from './channel.js';
import { ReconnectStrategy } from './reconnect.js';

const DEFAULT_CONFIG: WsMultiplexerConfig = {
  url: 'ws://localhost:8080',
  reconnect: {},
  heartbeatInterval: 30_000,
  heartbeatTimeout: 10_000,
  maxBinarySize: 10 * 1024 * 1024, // 10MB
  connectionTimeout: 10_000,
};

type WsLike = {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  readyState: number;
};

/**
 * WebSocket Multiplexer.
 * Manages a single WebSocket connection and demultiplexes messages
 * into topic-based channels. Supports reconnection with backoff,
 * heartbeat, and binary frames for large payloads.
 */
export class WsMultiplexer {
  private config: WsMultiplexerConfig;
  private ws: WsLike | null = null;
  private channels = new Map<string, WsChannel>();
  private reconnectStrategy: ReconnectStrategy;
  private connectionListeners: WsConnectionListener[] = [];
  private _state: WsConnectionState = 'disconnected';
  private _connectedAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPingAt = 0;
  private rttSamples: number[] = [];

  // Stats
  private _messagesSent = 0;
  private _messagesReceived = 0;
  private _bytesSent = 0;
  private _bytesReceived = 0;

  // Pending message buffer for offline sends (max 100)
  private _pendingMessages: ChannelMessage[] = [];

  constructor(config?: Partial<WsMultiplexerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reconnectStrategy = new ReconnectStrategy(this.config.reconnect);
  }

  /**
   * Connect to the WebSocket server.
   */
  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this._state = 'connecting';

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      try {
        this.createConnection(resolve, reject, timeout);
      } catch (err) {
        clearTimeout(timeout);
        this._state = 'disconnected';
        reject(err);
      }
    });
  }

  /**
   * Subscribe to a channel by name.
   * Creates the channel if it doesn't exist.
   */
  channel<T = unknown>(name: string, options?: Partial<ChannelSubscriptionOptions>): WsChannel<T> {
    let ch = this.channels.get(name) as WsChannel<T> | undefined;
    if (!ch) {
      ch = new WsChannel<T>(name, options);
      ch.setSendFunction((msg: ChannelMessage<T>) => this.sendRaw(msg));
      this.channels.set(name, ch as WsChannel);
    }
    return ch;
  }

  /**
   * Remove a channel.
   */
  removeChannel(name: string): boolean {
    const ch = this.channels.get(name);
    if (!ch) return false;
    ch.close();
    this.channels.delete(name);
    return true;
  }

  /**
   * Listen for connection events.
   */
  on(listener: WsConnectionListener): () => void {
    this.connectionListeners.push(listener);
    return () => {
      this.connectionListeners = this.connectionListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Disconnect gracefully.
   */
  disconnect(code = 1000, reason = 'Normal closure'): void {
    this.reconnectStrategy.abort();
    this.stopHeartbeat();

    if (this.ws) {
      try {
        this.ws.close(code, reason);
      } catch {
        // Already closed
      }
      this.ws = null;
    }

    this._state = 'closed';
    this.emit({ type: 'disconnected', code, reason });

    // Close all channels
    for (const [, ch] of this.channels) {
      ch.close();
    }
    this.channels.clear();
  }

  /**
   * Get comprehensive stats.
   */
  get stats(): WsMuxStats {
    return {
      messagesSent: this._messagesSent,
      messagesReceived: this._messagesReceived,
      bytesSent: this._bytesSent,
      bytesReceived: this._bytesReceived,
      activeChannels: this.channels.size,
      state: this._state,
      reconnectAttempts: this.reconnectStrategy.attempts,
      avgRtt:
        this.rttSamples.length > 0
          ? this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length
          : 0,
      uptime: this._connectedAt > 0 ? Date.now() - this._connectedAt : 0,
    };
  }

  get state(): WsConnectionState {
    return this._state;
  }

  get channelNames(): string[] {
    return Array.from(this.channels.keys());
  }

  // --- Private ---

  private createConnection(
    resolve: () => void,
    reject: (err: Error) => void,
    timeout: ReturnType<typeof setTimeout>,
  ): void {
    // Dynamic import of ws to avoid issues when not installed
    import('ws' as string)
      .then((wsModule) => {
        const WebSocketClass = wsModule.default || wsModule.WebSocket;
        const ws = new WebSocketClass(this.config.url, {
          headers: this.config.headers,
        }) as WsLike;

        ws.on('open', () => {
          clearTimeout(timeout);
          this.ws = ws;
          this._state = 'connected';
          this._connectedAt = Date.now();
          this.reconnectStrategy.onConnected(() => this.reconnectStrategy.reset());
          this.emit({ type: 'connected', url: this.config.url });
          this.startHeartbeat();
          this.flushAllChannels();
          this.flushPendingMessages();
          resolve();
        });

        ws.on('message', (data: unknown) => {
          this.handleMessage(data);
        });

        ws.on('close', (code: unknown, reason: unknown) => {
          clearTimeout(timeout);
          const closeCode = typeof code === 'number' ? code : 1006;
          const closeReason = typeof reason === 'string' ? reason : 'Unknown';

          this._state = 'disconnected';
          this.stopHeartbeat();
          this.emit({ type: 'disconnected', code: closeCode, reason: closeReason });

          if (this.reconnectStrategy.enabled && !this.reconnectStrategy.aborted) {
            this.scheduleReconnect();
          }
        });

        ws.on('error', (err: unknown) => {
          clearTimeout(timeout);
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit({ type: 'error', error });
          if (this._state === 'connecting') {
            reject(error);
          }
        });

        ws.on('pong', () => {
          this.handlePong();
        });
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        const error = err instanceof Error ? err : new Error(String(err));
        this._state = 'disconnected';
        reject(error);
      });
  }

  private handleMessage(data: unknown): void {
    this._messagesReceived++;

    if (Buffer.isBuffer(data)) {
      this._bytesReceived += data.length;
      this.handleBinaryFrame(data);
      return;
    }

    if (typeof data === 'string') {
      this._bytesReceived += data.length * 2;
      this.handleTextFrame(data);
      return;
    }

    // ArrayBuffer or other
    if (data instanceof ArrayBuffer) {
      this._bytesReceived += data.byteLength;
      this.handleBinaryFrame(Buffer.from(data));
    }
  }

  private handleTextFrame(text: string): void {
    try {
      const msg = JSON.parse(text) as ChannelMessage;
      if (!msg.channel) return;

      // Handle heartbeat ACK
      if (msg.channel === '__heartbeat' && msg.type === 'pong') {
        return; // Already handled via ws pong
      }

      const channel = this.channels.get(msg.channel);
      if (channel) {
        channel.receive(msg);
      }

      this.emit({ type: 'message', channel: msg.channel, data: msg.payload });
    } catch {
      // Invalid JSON - ignore malformed message
    }
  }

  private handleBinaryFrame(buffer: Buffer): void {
    try {
      const header = this.decodeBinaryHeader(buffer);
      if (!header) return;

      const payloadBuffer = buffer.subarray(header.payloadOffset);
      let payload: unknown;
      try {
        payload = JSON.parse(payloadBuffer.toString('utf-8'));
      } catch {
        payload = payloadBuffer; // Keep as buffer if not JSON
      }

      const msg: ChannelMessage = {
        channel: header.channel,
        type: header.type,
        payload,
        id: `bin:${Date.now()}:${Math.random().toString(36).substring(2, 8)}`,
        timestamp: Date.now(),
      };

      const channel = this.channels.get(msg.channel);
      if (channel) {
        channel.receive(msg);
      }
    } catch {
      // Binary decode error - ignore
    }
  }

  private sendRaw(msg: ChannelMessage): boolean {
    if (!this.ws || this._state !== 'connected') {
      // Buffer message for retry on reconnect instead of silent drop
      this._pendingMessages ??= [];
      if (this._pendingMessages.length < 100) {
        this._pendingMessages.push(msg);
      }
      return false;
    }

    try {
      const text = JSON.stringify(msg);
      this.ws.send(text);
      this._messagesSent++;
      this._bytesSent += text.length * 2;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Flush buffered pending messages after reconnection.
   */
  private flushPendingMessages(): void {
    if (this._pendingMessages.length === 0) return;
    const pending = this._pendingMessages.splice(0);
    for (const msg of pending) {
      this.sendRaw(msg);
    }
  }

  /**
   * Send binary frame with header prefix.
   * Format: [2B channel len][channel][2B type len][type][payload]
   */
  sendBinary(channel: string, type: string, payload: Buffer | string): void {
    if (!this.ws || this._state !== 'connected') return;

    const channelBuf = Buffer.from(channel, 'utf-8');
    const typeBuf = Buffer.from(type, 'utf-8');
    const payloadBuf = typeof payload === 'string' ? Buffer.from(payload, 'utf-8') : payload;

    const headerSize = 2 + channelBuf.length + 2 + typeBuf.length;
    const frame = Buffer.alloc(headerSize + payloadBuf.length);

    frame.writeUInt16BE(channelBuf.length, 0);
    channelBuf.copy(frame, 2);
    frame.writeUInt16BE(typeBuf.length, 2 + channelBuf.length);
    typeBuf.copy(frame, 4 + channelBuf.length);
    payloadBuf.copy(frame, headerSize);

    this.ws.send(frame);
    this._messagesSent++;
    this._bytesSent += frame.length;
  }

  private decodeBinaryHeader(buffer: Buffer): BinaryFrameHeader | null {
    if (buffer.length < 4) return null;

    const channelLength = buffer.readUInt16BE(0);
    if (buffer.length < 2 + channelLength + 2) return null;

    const channel = buffer.subarray(2, 2 + channelLength).toString('utf-8');
    const typeOffset = 2 + channelLength;
    const typeLength = buffer.readUInt16BE(typeOffset);
    const type = buffer.subarray(typeOffset + 2, typeOffset + 2 + typeLength).toString('utf-8');
    const payloadOffset = typeOffset + 2 + typeLength;

    return { channelLength, channel, typeLength, type, payloadOffset };
  }

  private startHeartbeat(): void {
    if (this.config.heartbeatInterval <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this._state === 'connected') {
        this.lastPingAt = Date.now();
        try {
          this.ws.send(
            JSON.stringify({
              channel: '__heartbeat',
              type: 'ping',
              payload: { timestamp: this.lastPingAt },
              id: `hb:${this.lastPingAt}`,
              timestamp: this.lastPingAt,
            }),
          );
        } catch {
          // Heartbeat send failed
        }

        // Set timeout for pong response
        this.heartbeatTimeoutTimer = setTimeout(() => {
          // No pong received - connection may be dead
          if (this.ws) {
            try {
              this.ws.close(4000, 'Heartbeat timeout');
            } catch {
              // Close failed
            }
          }
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);

    if (
      this.heartbeatTimer &&
      typeof this.heartbeatTimer === 'object' &&
      'unref' in this.heartbeatTimer
    ) {
      this.heartbeatTimer.unref();
    }
  }

  private handlePong(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }

    const rtt = Date.now() - this.lastPingAt;
    this.rttSamples.push(rtt);
    if (this.rttSamples.length > 50) {
      this.rttSamples.shift();
    }

    this.emit({ type: 'heartbeat', rtt });
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this._state = 'reconnecting';
    const delay = this.reconnectStrategy.schedule(() => {
      this.connect().catch(() => {
        // Reconnect failed - strategy will retry
      });
    });

    if (delay >= 0) {
      this.emit({
        type: 'reconnecting',
        attempt: this.reconnectStrategy.attempts,
        delay,
      });
    }
  }

  private flushAllChannels(): void {
    for (const [, ch] of this.channels) {
      if (ch.bufferedCount > 0) {
        ch.flushBuffer();
      }
    }
  }

  private emit(event: WsConnectionEvent): void {
    for (const listener of this.connectionListeners) {
      try {
        listener(event);
      } catch {
        // Listener error should not break multiplexer
      }
    }
  }
}
