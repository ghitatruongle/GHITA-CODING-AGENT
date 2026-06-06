// ==============================================================================
// GHITA CODING AGENT - Streaming Buffer (Phase 14 — Update 0.0.3)
// ==============================================================================
// Buffer management: accumulates partial streaming chunks into complete
// messages / tool calls. Handles delta-based and token-based protocols.
// ==============================================================================

export interface BufferConfig {
  /** Max buffer size in bytes before forcing flush */
  maxBytes?: number;
  /** Max buffer age in ms before forcing flush */
  maxAgeMs?: number;
  /** Delimiter that signals end of a chunk (e.g. '\n\n' for SSE) */
  delimiter?: string;
}

export interface BufferedChunk {
  /** Concatenated content of all chunks in this buffer */
  content: string;
  /** Number of source chunks merged */
  count: number;
  /** First chunk timestamp */
  startedAt: number;
  /** Last chunk timestamp */
  lastUpdateAt: number;
}

/**
 * StreamingBuffer — accumulates partial chunks and yields complete messages.
 * Used for SSE / WebSocket / LLM streaming response assembly.
 */
export class StreamingBuffer {
  private buffer = '';
  private chunkCount = 0;
  private startedAt = 0;
  private lastUpdateAt = 0;
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly maxAgeMs: number;
  private readonly delimiter: string;

  constructor(config: BufferConfig = {}) {
    this.maxBytes = config.maxBytes ?? 1024 * 64;
    this.maxAgeMs = config.maxAgeMs ?? 100;
    this.delimiter = config.delimiter ?? '\n\n';
  }

  push(chunk: string): string[] {
    const now = Date.now();
    if (this.chunkCount === 0) this.startedAt = now;
    this.lastUpdateAt = now;
    this.buffer += chunk;
    this.bytes += chunk.length;
    this.chunkCount++;

    const completed: string[] = [];
    let idx = this.buffer.indexOf(this.delimiter);
    while (idx !== -1) {
      completed.push(this.buffer.slice(0, idx));
      this.buffer = this.buffer.slice(idx + this.delimiter.length);
      idx = this.buffer.indexOf(this.delimiter);
    }
    return completed;
  }

  shouldFlush(): boolean {
    if (this.bytes >= this.maxBytes) return true;
    if (this.chunkCount > 0 && Date.now() - this.lastUpdateAt >= this.maxAgeMs) return true;
    return false;
  }

  flush(): string {
    const out = this.buffer;
    this.buffer = '';
    this.bytes = 0;
    return out;
  }

  snapshot(): BufferedChunk {
    return {
      content: this.buffer,
      count: this.chunkCount,
      startedAt: this.startedAt,
      lastUpdateAt: this.lastUpdateAt,
    };
  }

  reset(): void {
    this.buffer = '';
    this.chunkCount = 0;
    this.startedAt = 0;
    this.lastUpdateAt = 0;
    this.bytes = 0;
  }

  get size(): number {
    return this.bytes;
  }

  get isEmpty(): boolean {
    return this.buffer.length === 0;
  }
}
