/** WebSocket connection state */
export type WsConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'closed';

/** Frame types for binary/JSON protocol */
export type WsFrameType = 'text' | 'binary' | 'ping' | 'pong' | 'close';

/** Channel message envelope */
export interface ChannelMessage<T = unknown> {
  /** Channel/topic identifier */
  channel: string;
  /** Message type within the channel */
  type: string;
  /** Message payload */
  payload: T;
  /** Unique message ID */
  id: string;
  /** Timestamp (ms) */
  timestamp: number;
  /** Whether this message expects a response */
  replyTo?: string;
}

/** Channel subscription options */
export interface ChannelSubscriptionOptions {
  /** Auto-reconnect on disconnect */
  autoReconnect: boolean;
  /** Max messages to buffer while disconnected */
  bufferLimit: number;
  /** QoS level: 0 = at most once, 1 = at least once, 2 = exactly once */
  qos: 0 | 1 | 2;
  /** Binary frame mode for large payloads */
  binary: boolean;
}

/** Reconnect strategy configuration */
export interface ReconnectConfig {
  /** Enable auto-reconnect */
  enabled: boolean;
  /** Initial delay in ms */
  initialDelay: number;
  /** Maximum delay in ms */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Maximum reconnect attempts (0 = infinite) */
  maxAttempts: number;
  /** Add random jitter (0-1, fraction of delay) */
  jitter: number;
  /** Reset attempt count after this many ms of stable connection */
  resetAfter: number;
}

/** Multiplexer configuration */
export interface WsMultiplexerConfig {
  /** WebSocket server URL */
  url: string;
  /** Reconnect strategy */
  reconnect: Partial<ReconnectConfig>;
  /** Heartbeat interval in ms (0 = disabled) */
  heartbeatInterval: number;
  /** Heartbeat timeout in ms */
  heartbeatTimeout: number;
  /** Max message size in bytes for binary frames */
  maxBinarySize: number;
  /** Connection timeout in ms */
  connectionTimeout: number;
  /** Authentication token */
  authToken?: string;
  /** Custom headers for WS handshake */
  headers?: Record<string, string>;
}

/** Connection event types */
export type WsConnectionEvent =
  | { type: 'connected'; url: string }
  | { type: 'disconnected'; code: number; reason: string }
  | { type: 'reconnecting'; attempt: number; delay: number }
  | { type: 'error'; error: Error }
  | { type: 'message'; channel: string; data: unknown }
  | { type: 'heartbeat'; rtt: number };

/** Event listener for connection events */
export type WsConnectionListener = (event: WsConnectionEvent) => void;

/** Channel handler callback */
export type ChannelHandler<T = unknown> = (message: ChannelMessage<T>) => void;

/** Binary frame header structure */
export interface BinaryFrameHeader {
  /** Channel name length (2 bytes) */
  channelLength: number;
  /** Channel name (UTF-8) */
  channel: string;
  /** Message type length (2 bytes) */
  typeLength: number;
  /** Message type (UTF-8) */
  type: string;
  /** Payload starts after header */
  payloadOffset: number;
}

/** Multiplexer statistics */
export interface WsMuxStats {
  /** Total messages sent */
  messagesSent: number;
  /** Total messages received */
  messagesReceived: number;
  /** Total bytes sent */
  bytesSent: number;
  /** Total bytes received */
  bytesReceived: number;
  /** Active channels count */
  activeChannels: number;
  /** Current connection state */
  state: WsConnectionState;
  /** Reconnection attempts */
  reconnectAttempts: number;
  /** Average heartbeat RTT in ms */
  avgRtt: number;
  /** Uptime in ms */
  uptime: number;
}
