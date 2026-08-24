// Thread-safe buffer for injecting user commands into a running agent at safe
// points between turns (pattern: grok-build xai-interjection-core). The buffer
// accumulates messages while the agent is mid-turn and drains them at the next
// safe injection point (after all pending tool actions complete, before the
// next LLM call). This prevents race conditions where user input arrives
// during tool execution or model streaming.

/** A single interjection message queued by the user. */
export interface InterjectionMessage {
  /** Unique id for tracking. */
  id: string;
  /** The user's injected text. */
  text: string;
  /** Unix timestamp when the interjection was queued. */
  timestamp: number;
}

/**
 * Bounded FIFO buffer for interjection messages. Drains atomically at safe
 * points in the agent loop so injected commands never interrupt mid-tool or
 * mid-stream.
 */
export class InterjectionBuffer {
  private readonly queue: InterjectionMessage[] = [];
  private readonly maxPending: number;

  constructor(options?: { maxPending?: number }) {
    this.maxPending = options?.maxPending ?? 20;
  }

  /** Queue a user message for injection at the next safe point. */
  enqueue(text: string): InterjectionMessage {
    const msg: InterjectionMessage = {
      id: `inj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      timestamp: Date.now(),
    };
    this.queue.push(msg);
    // Drop oldest if over capacity to prevent unbounded growth.
    while (this.queue.length > this.maxPending) {
      this.queue.shift();
    }
    return msg;
  }

  /**
   * Drain all pending interjections atomically. Returns an empty array if
   * nothing is queued. Safe to call at every iteration boundary.
   */
  drain(): InterjectionMessage[] {
    if (this.queue.length === 0) return [];
    const batch = [...this.queue];
    this.queue.length = 0;
    return batch;
  }

  /** Check whether there are pending interjections without consuming them. */
  hasPending(): boolean {
    return this.queue.length > 0;
  }

  /** Number of currently buffered interjections. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Discard all pending interjections (e.g. on agent abort). */
  clear(): void {
    this.queue.length = 0;
  }
}
