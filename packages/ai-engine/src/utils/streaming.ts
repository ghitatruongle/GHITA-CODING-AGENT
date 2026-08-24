import { sleep } from '@ghita/shared';
import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage } from '../types.js';

export interface SmoothStreamOptions {
  delayMs?: number; // Delay in milliseconds per chunk yield
  chunkSize?: number; // Number of characters to yield at a time
}

/**
 * Paces the yielding of stream chunks to create a smooth, premium visual typing effect.
 */
export async function* smoothStream(
  stream: AsyncGenerator<AIStreamChunk>,
  options?: SmoothStreamOptions,
): AsyncGenerator<AIStreamChunk> {
  const delayMs = options?.delayMs ?? 15;
  const chunkSize = options?.chunkSize ?? 2;

  for await (const chunk of stream) {
    if (!chunk.content) {
      yield chunk;
      continue;
    }

    const text = chunk.content;
    let index = 0;
    while (index < text.length) {
      const slice = text.substring(index, index + chunkSize);
      index += chunkSize;

      yield {
        ...chunk,
        content: slice,
      };
      await sleep(delayMs);
    }
  }
}

/**
 * Tracks stream metrics, timing, frequencies, and analyze chunk formatting.
 */
export class ChunkDetector {
  private arrivalTimes: number[] = [];
  private chunkSizes: number[] = [];
  private totalChunks = 0;
  private startTime = 0;

  recordChunk(chunk: AIStreamChunk): void {
    const now = Date.now();
    if (this.totalChunks === 0) {
      this.startTime = now;
    }
    this.arrivalTimes.push(now);
    this.chunkSizes.push(chunk.content?.length ?? 0);
    this.totalChunks++;
  }

  getMetrics() {
    if (this.totalChunks === 0) {
      return {
        totalChunks: 0,
        averageChunkSize: 0,
        chunksPerSecond: 0,
        averageIntervalMs: 0,
      };
    }

    const now = Date.now();
    const elapsedSec = (now - this.startTime) / 1000;
    const chunksPerSecond = elapsedSec > 0 ? this.totalChunks / elapsedSec : 0;

    const totalChars = this.chunkSizes.reduce((a, b) => a + b, 0);
    const averageChunkSize = totalChars / this.totalChunks;

    let totalInterval = 0;
    for (let i = 1; i < this.arrivalTimes.length; i++) {
      const current = this.arrivalTimes[i];
      const previous = this.arrivalTimes[i - 1];
      if (current !== undefined && previous !== undefined) {
        totalInterval += current - previous;
      }
    }
    const averageIntervalMs =
      this.arrivalTimes.length > 1 ? totalInterval / (this.arrivalTimes.length - 1) : 0;

    return {
      totalChunks: this.totalChunks,
      averageChunkSize,
      chunksPerSecond,
      averageIntervalMs,
    };
  }
}

/**
 * A robust token estimator and metrics calculator.
 */
export class TokenCalculator {
  private startTime = 0;
  private tokenCount = 0;

  /**
   * Estimates tokens for a given string using a balanced character-word heuristic.
   */
  static estimateStringTokens(text: string): number {
    if (!text) return 0;
    const charCount = text.length;
    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // Heuristics: ~4 chars per token, ~1.3 tokens per word
    const charEstimate = Math.ceil(charCount / 3.8);
    const wordEstimate = Math.ceil(wordCount * 1.3);

    return Math.max(charEstimate, wordEstimate);
  }

  /**
   * Estimates input tokens for an array of chat messages.
   */
  static estimateMessagesTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += 4; // Message overhead
      total += TokenCalculator.estimateStringTokens(msg.content);
    }
    total += 3; // Conversation start overhead
    return total;
  }

  /**
   * Starts tracking tokens in a stream.
   */
  startStream(): void {
    this.startTime = Date.now();
    this.tokenCount = 0;
  }

  /**
   * Records text received in a stream chunk and adds to total estimated tokens.
   */
  recordStreamToken(text: string): void {
    if (this.startTime === 0) {
      this.startTime = Date.now();
    }
    const tokens = TokenCalculator.estimateStringTokens(text);
    this.tokenCount += tokens;
  }

  /**
   * Returns current tokens-per-second, elapsed time, and total tokens.
   */
  getStreamMetrics() {
    const elapsedMs = Date.now() - this.startTime;
    const elapsedSec = elapsedMs / 1000;
    const tokensPerSecond = elapsedSec > 0 ? this.tokenCount / elapsedSec : 0;

    return {
      estimatedTokens: this.tokenCount,
      elapsedMs,
      tokensPerSecond,
    };
  }
}
