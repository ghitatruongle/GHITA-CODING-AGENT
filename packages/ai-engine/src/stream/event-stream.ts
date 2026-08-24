// Lightweight pub/sub bus for engine events. Used by the orchestrator, tool
// registry, hook runner, and the Tauri WebSocket bridge.
//
// Design notes:
//  - Events are ALWAYS plain JSON-serializable dicts (event_to_dict).
//  - Subscribers are called synchronously by default; async handlers are
//    detached and never block the emitter.
//  - A bounded ring buffer keeps the last N events for late subscribers.
//  - Optional RewindWriter hooks events to disk for session rewind.
//  - A builtin "plugin API" hook runner delegates to OpenClawPluginApi
//    when registered (no-op in the OSS-only build).

import type {
  EventStreamConfig,
  EventSubscriber,
  ReplayFilter,
  RewindWriter,
  StreamEvent,
  StreamEventType,
  StreamStats,
} from './types.js';

const DEFAULT_BUFFER_SIZE = 1000;
const DEFAULT_MAX_SUBSCRIBERS = 256;

/**
 * A simple in-memory ring buffer keyed by monotonically increasing event id.
 * Older entries are discarded automatically when the cap is hit.
 */
class RingBuffer {
  private readonly cap: number;
  private readonly items: StreamEvent[] = [];

  constructor(cap: number) {
    this.cap = Math.max(1, cap);
  }

  push(event: StreamEvent): void {
    this.items.push(event);
    if (this.items.length > this.cap) {
      this.items.shift();
    }
  }

  toArray(): StreamEvent[] {
    return [...this.items];
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }
}

export class EventStream {
  private readonly buffer: RingBuffer;
  private readonly subscribers = new Set<EventSubscriber>();
  private readonly rewindWriter?: RewindWriter;
  private readonly swallowErrors: boolean;
  private readonly maxSubscribers: number;
  private nextId = 1;
  private seq = 0;
  private totalEmitted = 0;
  private totalDelivered = 0;
  private totalDropped = 0;
  private totalErrors = 0;

  /** External plugin hook API (OpenClawPluginApi in the Pro build). */
  private pluginHookRunner?: (event: StreamEvent) => void | Promise<void>;

  constructor(config?: EventStreamConfig) {
    this.buffer = new RingBuffer(config?.bufferSize ?? DEFAULT_BUFFER_SIZE);
    this.rewindWriter = config?.rewindWriter;
    this.swallowErrors = config?.swallowErrors ?? true;
    this.maxSubscribers = config?.maxSubscribers ?? DEFAULT_MAX_SUBSCRIBERS;
  }

  // Subscription
  
  /**
   * Register a subscriber. Returns an unsubscribe function.
   * By default, the new subscriber also receives the last buffered replay
   * so the UI can show history right after connecting.
   */
  subscribe(subscriber: EventSubscriber, options?: { replay?: boolean }): () => void {
    if (this.subscribers.size >= this.maxSubscribers) {
      this.totalDropped += 1;
      throw new Error(`EventStream: subscriber limit reached (max=${this.maxSubscribers})`);
    }
    this.subscribers.add(subscriber);

    if (options?.replay !== false) {
      // Replay buffered events to the new subscriber (best-effort)
      const snapshot = this.buffer.toArray();
      for (const evt of snapshot) {
        this.invokeSubscriber(subscriber, evt);
      }
    }

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** Number of active subscribers. */
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  // Emit / publish
  
  /**
   * Emit a new event. The event is stamped with id+timestamp+seq,
   * pushed to the ring buffer, optionally persisted, and fanned out
   * to every active subscriber.
   */
  async emit(
    type: StreamEventType,
    source: StreamEvent['source'],
    data: Record<string, unknown> = {},
    extras?: { toolName?: string; sessionId?: string },
  ): Promise<StreamEvent> {
    const event: StreamEvent = {
      id: this.nextId++,
      type,
      source,
      timestamp: Date.now(),
      sessionId: extras?.sessionId,
      toolName: extras?.toolName,
      data,
      seq: ++this.seq,
    };

    this.totalEmitted += 1;
    this.buffer.push(event);

    if (this.rewindWriter) {
      try {
        await this.rewindWriter.append(event);
      } catch (err) {
        this.totalErrors += 1;
        if (!this.swallowErrors) throw err;
      }
    }

    // Fan out — copy subscriber set to be safe against mutations during dispatch
    const subs = [...this.subscribers];
    for (const sub of subs) {
      this.invokeSubscriber(sub, event);
    }

    // Notify external plugin hook runner if registered
    if (this.pluginHookRunner) {
      try {
        await this.pluginHookRunner(event);
      } catch (err) {
        this.totalErrors += 1;
        if (!this.swallowErrors) throw err;
      }
    }

    return event;
  }

  private invokeSubscriber(sub: EventSubscriber, event: StreamEvent): void {
    try {
      const result = sub(event);
      this.totalDelivered += 1;
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch((err) => {
          this.totalErrors += 1;
          if (!this.swallowErrors) throw err;
        });
      }
    } catch (err) {
      this.totalErrors += 1;
      if (!this.swallowErrors) throw err;
    }
  }

  // Buffer / replay
  
  /** Snapshot of the buffered events (in arrival order). */
  snapshot(): StreamEvent[] {
    return this.buffer.toArray();
  }

  /**
   * Replay buffered events that match the filter, in arrival order.
   * If a subscriber is passed, every match is delivered to it. Otherwise
   * the matches are returned as an array.
   */
  replay(filter: ReplayFilter = {}, subscriber?: EventSubscriber): StreamEvent[] {
    const matches = this.filterEvents(this.buffer.toArray(), filter);

    if (subscriber) {
      for (const evt of matches) {
        this.invokeSubscriber(subscriber, evt);
      }
    }
    return matches;
  }

  /** Clear the ring buffer (does not clear rewind storage). */
  clearBuffer(): void {
    this.buffer.clear();
  }

  private filterEvents(events: StreamEvent[], filter: ReplayFilter): StreamEvent[] {
    let out = events;

    if (filter.type) {
      const allowed = Array.isArray(filter.type) ? filter.type : [filter.type];
      out = out.filter((e) => allowed.includes(e.type));
    }
    if (filter.source) {
      const allowed = Array.isArray(filter.source) ? filter.source : [filter.source];
      out = out.filter((e) => allowed.includes(e.source));
    }
    if (filter.toolName) {
      out = out.filter((e) => e.toolName === filter.toolName);
    }
    if (filter.sessionId) {
      out = out.filter((e) => e.sessionId === filter.sessionId);
    }
    if (typeof filter.since === 'number') {
      const since = filter.since;
      out = out.filter((e) => e.timestamp >= since);
    }
    if (typeof filter.until === 'number') {
      const until = filter.until;
      out = out.filter((e) => e.timestamp <= until);
    }
    if (typeof filter.limit === 'number' && filter.limit > 0) {
      out = out.slice(-filter.limit);
    }
    return out;
  }

  // WebSocket bridge
  
  /**
   * Bridge this stream to a Tauri WebSocket. The bridge attaches a
   * subscriber that JSON-serializes each event and forwards it to the
   * provided sender function. Returns the unsubscribe handle.
   *
   * The sender is intentionally duck-typed so the Tauri Rust side or a
   * test double can both be plugged in.
   */
  attachWebSocketBridge(
    sender: (json: string) => void | Promise<void>,
    options?: { replay?: boolean },
  ): () => void {
    return this.subscribe((event) => {
      const json = event_to_dict(event);
      void sender(JSON.stringify(json));
    }, options);
  }

  // Plugin hook API
  
  /**
   * Register an external plugin hook runner. Used by OpenClawPluginApi to
   * observe engine events without subscribing as a normal subscriber.
   * Pass `null` to unregister.
   */
  setPluginHookRunner(runner: ((event: StreamEvent) => void | Promise<void>) | null): void {
    this.pluginHookRunner = runner ?? undefined;
  }

  // Stats / introspection
  
  getStats(): StreamStats {
    const snap = this.buffer.toArray();
    return {
      totalEmitted: this.totalEmitted,
      totalDelivered: this.totalDelivered,
      totalDropped: this.totalDropped,
      totalErrors: this.totalErrors,
      subscriberCount: this.subscribers.size,
      bufferSize: snap.length,
      oldestBufferedId: snap[0]?.id ?? null,
      newestBufferedId: snap[snap.length - 1]?.id ?? null,
    };
  }

  /** Reset all counters. Does not touch the buffer or subscribers. */
  resetStats(): void {
    this.totalEmitted = 0;
    this.totalDelivered = 0;
    this.totalDropped = 0;
    this.totalErrors = 0;
  }
}

// Helpers

/**
 * Convert a StreamEvent to a plain JSON-serializable dict.
 * Used by the WebSocket bridge and by tests. The output shape is:
 *   { id, type, source, timestamp, sessionId?, toolName?, seq?, data }
 * where `data` is recursively normalized.
 */
export function event_to_dict(event: StreamEvent): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    toolName: event.toolName,
    seq: event.seq,
    data: deepClone(event.data),
  };
}

/**
 * Reconstruct a StreamEvent from a dict (e.g. one received over WS).
 * Unknown fields are dropped; missing required fields throw.
 */
export function dict_to_event(input: unknown): StreamEvent {
  if (!input || typeof input !== 'object') {
    throw new Error('dict_to_event: input must be an object');
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.type !== 'string' || typeof raw.source !== 'string') {
    throw new Error('dict_to_event: missing type or source');
  }
  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    type: raw.type as StreamEventType,
    source: raw.source as StreamEvent['source'],
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
    toolName: typeof raw.toolName === 'string' ? raw.toolName : undefined,
    seq: typeof raw.seq === 'number' ? raw.seq : undefined,
    data:
      raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
        ? (raw.data as Record<string, unknown>)
        : {},
  };
}

/** JSON-safe deep clone for arbitrary payloads. */
function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
