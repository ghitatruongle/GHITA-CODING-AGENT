// ==============================================================================
// GHITA CODING AGENT - EventStream Types (Phase 7)
// ==============================================================================
// Public type surface for the EventStream subscriber model used by Phase 7.
// Events are serializable to plain JSON dicts so they can cross the
// Tauri WebSocket bridge and be persisted to disk for rewind/replay.
// ==============================================================================

/** Top-level event categories emitted by the engine. */
export type StreamEventType =
  | 'message.start'
  | 'message.delta'
  | 'message.complete'
  | 'tool.call'
  | 'tool.result'
  | 'tool.error'
  | 'hook.pre'
  | 'hook.post'
  | 'error'
  | 'session.start'
  | 'session.end'
  | 'session.rewind'
  | 'system.heartbeat';

/** Where the event originated — useful for filtering in the UI. */
export type EventSource =
  | 'orchestrator'
  | 'provider'
  | 'tool'
  | 'hook'
  | 'session'
  | 'plugin'
  | 'system';

/** A single serialized event flowing through the stream. */
export interface StreamEvent {
  /** Monotonically increasing per-stream id */
  id: number;
  /** Event category */
  type: StreamEventType;
  /** Event source */
  source: EventSource;
  /** Wall-clock timestamp in ms */
  timestamp: number;
  /** Optional session id this event belongs to */
  sessionId?: string;
  /** Optional tool name when source is 'tool' or 'hook' */
  toolName?: string;
  /** Free-form JSON-serializable payload */
  data: Record<string, unknown>;
  /** Optional sequence number used for rewind */
  seq?: number;
}

/** Subscriber callback signature. */
export type EventSubscriber = (event: StreamEvent) => void | Promise<void>;

/** Configuration for the EventStream. */
export interface EventStreamConfig {
  /** Maximum events kept in the ring buffer (default: 1000) */
  bufferSize?: number;
  /** If true, persist every event to disk via the writer (default: false) */
  persist?: boolean;
  /** Optional rewind writer (used by SessionManager in Phase 24) */
  rewindWriter?: RewindWriter;
  /** If true, exceptions in subscribers are swallowed and logged (default: true) */
  swallowErrors?: boolean;
  /** Optional hard cap on subscriber count (default: 256) */
  maxSubscribers?: number;
}

/** Minimal interface for the rewind writer. Implemented in Phase 24. */
export interface RewindWriter {
  append(event: StreamEvent): void | Promise<void>;
  rewind(toSeq: number): Promise<StreamEvent[]>;
  size(): number;
}

/** Statistics returned by getStats(). */
export interface StreamStats {
  totalEmitted: number;
  totalDelivered: number;
  totalDropped: number;
  totalErrors: number;
  subscriberCount: number;
  bufferSize: number;
  oldestBufferedId: number | null;
  newestBufferedId: number | null;
}

/** Public filter shape for replay(). */
export interface ReplayFilter {
  type?: StreamEventType | StreamEventType[];
  source?: EventSource | EventSource[];
  toolName?: string;
  since?: number;
  until?: number;
  sessionId?: string;
  limit?: number;
}
