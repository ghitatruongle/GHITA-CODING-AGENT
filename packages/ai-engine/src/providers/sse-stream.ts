// ==============================================================================
// GHITA CODING AGENT - Phase 1: SSE Stream Encoder & Response Buffer
// ==============================================================================
// Handles Server-Sent Events encoding/decoding for POST /chat/stream endpoints
// and provides a robust ResponseBuffer for assembling partial JSON chunks.
// ==============================================================================

import type { AIStreamChunk } from '@ghita/shared';
import type { SSEStreamEvent, SSEEventType, ResponseBufferState } from './types.js';
import { TokenCalculator } from '../utils/streaming.js';

// ---------------------------------------------------------------------------
// SSE Encoder — converts AIStreamChunk → SSE text/event-stream frames
// ---------------------------------------------------------------------------

/**
 * Encodes stream events into SSE wire format.
 *
 * Each event is serialised as:
 * ```
 * event: <type>\n
 * data: <json>\n
 * \n
 * ```
 */
export class SSEEncoder {
  /**
   * Encode a single SSE event into the wire format string.
   */
  static encode(event: SSEStreamEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }

  /**
   * Encode a batch of events (useful for buffered flushes).
   */
  static encodeBatch(events: SSEStreamEvent[]): string {
    return events.map((e) => SSEEncoder.encode(e)).join('');
  }

  // --- Convenience factory methods ---

  static messageStart(provider: string, model: string): SSEStreamEvent {
    return {
      type: 'message_start',
      data: {
        provider: provider as SSEStreamEvent['data']['provider'],
        model,
        timestamp: Date.now(),
      },
    };
  }

  static contentDelta(content: string, provider?: string, model?: string): SSEStreamEvent {
    return {
      type: 'content_delta',
      data: {
        content,
        provider: provider as SSEStreamEvent['data']['provider'],
        model,
        timestamp: Date.now(),
      },
    };
  }

  static contentDone(provider?: string, model?: string): SSEStreamEvent {
    return {
      type: 'content_done',
      data: {
        provider: provider as SSEStreamEvent['data']['provider'],
        model,
        timestamp: Date.now(),
      },
    };
  }

  static messageStop(
    finishReason?: SSEStreamEvent['data']['finishReason'],
    usage?: SSEStreamEvent['data']['usage'],
  ): SSEStreamEvent {
    return {
      type: 'message_stop',
      data: { finishReason, usage, timestamp: Date.now() },
    };
  }

  static usage(usage: SSEStreamEvent['data']['usage']): SSEStreamEvent {
    return {
      type: 'usage',
      data: { usage, timestamp: Date.now() },
    };
  }

  static error(message: string): SSEStreamEvent {
    return {
      type: 'error',
      data: { error: message, timestamp: Date.now() },
    };
  }

  static ping(): SSEStreamEvent {
    return {
      type: 'ping',
      data: { timestamp: Date.now() },
    };
  }
}

// ---------------------------------------------------------------------------
// SSE Decoder — parses SSE wire format back into SSEStreamEvent[]
// ---------------------------------------------------------------------------

export class SSEDecoder {
  private buffer = '';

  /**
   * Feed raw text from an SSE stream and extract complete events.
   * Returns parsed events; incomplete data is buffered for the next call.
   */
  decode(chunk: string): SSEStreamEvent[] {
    this.buffer += chunk;
    const events: SSEStreamEvent[] = [];

    // SSE events are separated by double newlines
    const parts = this.buffer.split('\n\n');
    // The last part may be incomplete — keep it in the buffer
    this.buffer = parts.pop() ?? '';

    for (const part of parts) {
      const event = this.parseEventPart(part.trim());
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Flush any remaining buffered data as a final event (if valid).
   */
  flush(): SSEStreamEvent | null {
    if (!this.buffer.trim()) return null;
    const event = this.parseEventPart(this.buffer.trim());
    this.buffer = '';
    return event;
  }

  private parseEventPart(raw: string): SSEStreamEvent | null {
    let type: SSEEventType | undefined;
    const dataLines: string[] = [];

    for (const line of raw.split('\n')) {
      if (line.startsWith('event: ')) {
        type = line.slice(7).trim() as SSEEventType;
      } else if (line.startsWith('data: ')) {
        // Per SSE spec, multiple data: lines should be concatenated with '\n'
        dataLines.push(line.slice(6));
      }
    }

    if (!type || dataLines.length === 0) return null;

    const data = dataLines.join('\n');

    try {
      const parsed = JSON.parse(data) as SSEStreamEvent['data'];
      return { type, data: parsed };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// ResponseBuffer — accumulates partial JSON chunks from streaming responses
// ---------------------------------------------------------------------------

/**
 * A robust response buffer that assembles partial JSON/text from SSE streams.
 *
 * Features:
 * - Handles split JSON across multiple SSE chunks
 * - Tracks accumulated content and estimated token count
 * - Provides methods to extract complete JSON objects
 * - Supports both text streaming and structured JSON responses
 */
export class ResponseBuffer {
  private state: ResponseBufferState;
  private calculator = new TokenCalculator();

  constructor() {
    this.state = {
      buffer: '',
      complete: false,
      chunks: [],
      estimatedTokens: 0,
      startedAt: Date.now(),
    };
    this.calculator.startStream();
  }

  /**
   * Append a raw chunk from the stream.
   */
  appendChunk(chunk: AIStreamChunk): void {
    if (chunk.content) {
      this.state.buffer += chunk.content;
      this.calculator.recordStreamToken(chunk.content);
    }

    this.state.chunks.push(chunk);
    this.state.estimatedTokens = this.calculator.getStreamMetrics().estimatedTokens;

    if (chunk.done) {
      this.state.complete = true;
    }
  }

  /**
   * Append raw text directly (for non-chunk sources).
   */
  appendRaw(text: string): void {
    this.state.buffer += text;
    this.calculator.recordStreamToken(text);
    this.state.estimatedTokens = this.calculator.getStreamMetrics().estimatedTokens;
  }

  /**
   * Mark the buffer as complete.
   */
  markComplete(): void {
    this.state.complete = true;
  }

  /**
   * Get the current accumulated content.
   */
  getContent(): string {
    return this.state.buffer;
  }

  /**
   * Check if the stream is complete.
   */
  isComplete(): boolean {
    return this.state.complete;
  }

  /**
   * Get the total number of chunks received.
   */
  getChunkCount(): number {
    return this.state.chunks.length;
  }

  /**
   * Get streaming metrics (tokens, timing, throughput).
   */
  getMetrics() {
    return this.calculator.getStreamMetrics();
  }

  /**
   * Get the full buffer state (read-only snapshot).
   */
  getState(): Readonly<ResponseBufferState> {
    return { ...this.state, chunks: [...this.state.chunks] };
  }

  /**
   * Attempt to parse the buffer as JSON. Returns null if incomplete or invalid.
   * Useful for structured output streaming where the full response is a JSON object.
   */
  tryParseJSON<T = unknown>(): T | null {
    const trimmed = this.state.buffer.trim();
    if (!trimmed) return null;

    // Quick heuristic: check if it looks like a complete JSON object/array
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        // Incomplete or malformed — return null
        return null;
      }
    }

    return null;
  }

  /**
   * Extract complete JSON objects from the buffer, leaving remainder.
   * Useful when the stream contains multiple JSON objects concatenated.
   */
  extractJSONObjects<T = unknown>(): T[] {
    const results: T[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < this.state.buffer.length; i++) {
      const char = this.state.buffer[i];
      if (char === undefined) continue;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (inString) {
        // Only handle escape sequences inside strings
        if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      // Outside of strings
      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        if (depth === 0) start = i;
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        if (depth === 0 && start >= 0) {
          const jsonStr = this.state.buffer.slice(start, i + 1);
          try {
            results.push(JSON.parse(jsonStr) as T);
          } catch {
            // skip malformed
          }
          start = -1;
        }
      }
    }

    return results;
  }

  /**
   * Reset the buffer, clearing all accumulated data.
   */
  reset(): void {
    this.state = {
      buffer: '',
      complete: false,
      chunks: [],
      estimatedTokens: 0,
      startedAt: Date.now(),
    };
    this.calculator.startStream();
  }
}

// ---------------------------------------------------------------------------
// AsyncGenerator → SSE stream bridge
// ---------------------------------------------------------------------------

/**
 * Converts an AsyncGenerator<AIStreamChunk> into an async iterable of SSE-encoded strings.
 * Use this to pipe a provider's chatStream() into an HTTP response body.
 *
 * @example
 * ```ts
 * const stream = provider.chatStream(messages);
 * for await (const sseFrame of toSSEStream(stream)) {
 *   httpResponse.write(sseFrame);
 * }
 * ```
 */
export async function* toSSEStream(stream: AsyncGenerator<AIStreamChunk>): AsyncGenerator<string> {
  let first = true;

  for await (const chunk of stream) {
    // Emit message_start on first chunk
    if (first) {
      yield SSEEncoder.encode(
        SSEEncoder.messageStart(chunk.provider ?? 'unknown', chunk.model ?? 'unknown'),
      );
      first = false;
    }

    if (chunk.content) {
      yield SSEEncoder.encode(SSEEncoder.contentDelta(chunk.content, chunk.provider, chunk.model));
    }

    if (chunk.done) {
      yield SSEEncoder.encode(SSEEncoder.messageStop('stop', chunk.usage));
      return;
    }
  }

  // If stream ended without a done chunk, emit stop
  yield SSEEncoder.encode(SSEEncoder.messageStop('stop'));
}
