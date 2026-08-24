import type { ChannelMessage, ChannelHandler, ChannelSubscriptionOptions } from './types.js';

const DEFAULT_OPTIONS: ChannelSubscriptionOptions = {
  autoReconnect: true,
  bufferLimit: 1000,
  qos: 1,
  binary: false,
};

/**
 * A single channel within the WebSocket multiplexer.
 * Handles topic-based routing, message buffering, and QoS.
 */
export class WsChannel<T = unknown> {
  readonly name: string;
  private options: ChannelSubscriptionOptions;
  private handlers = new Set<ChannelHandler<T>>();
  private buffer: ChannelMessage<T>[] = [];
  private pendingAcks = new Map<
    string,
    { message: ChannelMessage<T>; timer: ReturnType<typeof setTimeout> }
  >();
  private _active = true;
  private sendFn: ((msg: ChannelMessage<T>) => void) | null = null;

  constructor(name: string, options?: Partial<ChannelSubscriptionOptions>) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Subscribe to messages on this channel.
   * Returns unsubscribe function.
   */
  subscribe(handler: ChannelHandler<T>): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Process an incoming message on this channel.
   */
  receive(message: ChannelMessage<T>): void {
    // QoS 2: check for duplicates
    if (this.options.qos === 2 && this.pendingAcks.has(message.id)) {
      return; // Duplicate message
    }

    // QoS 1 or 2: send ACK
    if (this.options.qos >= 1 && this.sendFn) {
      const ack: ChannelMessage = {
        channel: this.name,
        type: '__ack',
        payload: { id: message.id },
        id: `ack:${message.id}`,
        timestamp: Date.now(),
      };
      this.sendFn(ack as ChannelMessage<T>);
    }

    // Dispatch to handlers
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch (err) {
        console.error(`[WsChannel:${this.name}] Handler error:`, err);
      }
    }
  }

  /**
   * Send a message through this channel.
   */
  send(type: string, payload: T, options?: { replyTo?: string }): ChannelMessage<T> {
    const message: ChannelMessage<T> = {
      channel: this.name,
      type,
      payload,
      id: this.generateId(),
      timestamp: Date.now(),
      replyTo: options?.replyTo,
    };

    if (!this.sendFn) {
      // Buffer message if not connected
      this.bufferMessage(message);
      return message;
    }

    this.sendFn(message);
    return message;
  }

  /**
   * Set the send function (called by multiplexer).
   */
  setSendFunction(fn: (msg: ChannelMessage<T>) => void): void {
    this.sendFn = fn;
  }

  /**
   * Flush buffered messages (called when connection restored).
   */
  flushBuffer(): number {
    if (!this.sendFn) return 0;

    const count = this.buffer.length;
    for (const msg of this.buffer) {
      this.sendFn(msg);
    }
    this.buffer = [];
    return count;
  }

  /**
   * Close this channel and clean up resources.
   */
  close(): void {
    this._active = false;
    this.handlers.clear();
    this.buffer = [];
    for (const [, pending] of this.pendingAcks) {
      clearTimeout(pending.timer);
    }
    this.pendingAcks.clear();
    this.sendFn = null;
  }

  get active(): boolean {
    return this._active;
  }

  get bufferedCount(): number {
    return this.buffer.length;
  }

  get subscriberCount(): number {
    return this.handlers.size;
  }

  // --- Private ---

  private bufferMessage(message: ChannelMessage<T>): void {
    if (this.buffer.length >= this.options.bufferLimit) {
      // Drop oldest message
      this.buffer.shift();
    }
    this.buffer.push(message);
  }

  private generateId(): string {
    return `${this.name}:${Date.now()}:${Math.random().toString(36).substring(2, 8)}`;
  }
}
