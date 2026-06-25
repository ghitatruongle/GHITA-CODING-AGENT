// ==============================================================================
// GHITA CODING AGENT - Audio Ring Buffer (Phase 34)
// Fixed-size ring buffer for audio chunk accumulation
// ==============================================================================

import type { AudioChunk } from './types.js';

/**
 * Fixed-size ring buffer that accumulates raw audio samples (Int16 PCM).
 * Used to buffer audio before STT processing, enabling sliding-window
 * analysis and preventing unbounded memory growth.
 */
export class AudioRingBuffer {
  private buffer: Int16Array;
  private writePos = 0;
  private _size = 0;
  private readonly sampleRate: number;

  /**
   * @param capacity Maximum number of samples to store
   * @param sampleRate Audio sample rate (for duration calculations)
   */
  constructor(capacity: number, sampleRate = 16000) {
    this.buffer = new Int16Array(capacity);
    this.sampleRate = sampleRate;
  }

  /** Current number of samples in the buffer. */
  get size(): number {
    return this._size;
  }

  /** Maximum capacity in samples. */
  get capacity(): number {
    return this.buffer.length;
  }

  /** Current buffer fill as a percentage (0-1). */
  get fillRatio(): number {
    return this._size / this.buffer.length;
  }

  /** Duration of buffered audio in milliseconds. */
  get durationMs(): number {
    return (this._size / this.sampleRate) * 1000;
  }

  /** Whether the buffer is full. */
  get isFull(): boolean {
    return this._size >= this.buffer.length;
  }

  /* eslint-disable @typescript-eslint/no-non-null-assertion --
// ring-buffer tight loops; index is always in-bounds under the loop guard
// and replacing with `??` / explicit null-check slows the hot path noticeably
// when reading thousands of samples per audio frame. */
  /** Append audio samples from an AudioChunk. */
  push(chunk: AudioChunk): void {
    const samples = new Int16Array(chunk.data);
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writePos] = samples[i]!;
      this.writePos = (this.writePos + 1) % this.buffer.length;
      if (this._size < this.buffer.length) this._size++;
    }
  }

  /** Append raw Int16 samples. */
  pushSamples(samples: Int16Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writePos] = samples[i]!;
      this.writePos = (this.writePos + 1) % this.buffer.length;
      if (this._size < this.buffer.length) this._size++;
    }
  }

  /** Read the most recent N samples. Returns them in chronological order. */
  readLast(count: number): Int16Array {
    const n = Math.min(count, this._size);
    const result = new Int16Array(n);
    const start = (this.writePos - n + this.buffer.length) % this.buffer.length;
    for (let i = 0; i < n; i++) {
      result[i] = this.buffer[(start + i) % this.buffer.length]!;
    }
    return result;
  }

  /** Read all buffered samples in chronological order. */
  readAll(): Int16Array {
    return this.readLast(this._size);
  }

  /** Convert buffered samples to an ArrayBuffer (for STT processing). */
  toArrayBuffer(): ArrayBuffer {
    const samples = this.readAll();
    return samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength) as ArrayBuffer;
  }

  /** Compute the RMS energy of the buffered audio. */
  computeRms(): number {
    if (this._size === 0) return 0;
    let sum = 0;
    const samples = this.readAll();
    for (let i = 0; i < samples.length; i++) {
      // Int16Array index access is always in-bounds under the loop guard
      // ('i < samples.length'). noUncheckedIndexedAccess flags it but a
      // non-null assertion would trip eslint; use a numeric ??= fallback.
      const si = samples[i] ?? 0;
      const s = si / 32768;
      sum += s * s;
    }
    return Math.sqrt(sum / samples.length);
  }

  /** Clear the buffer. */
  clear(): void {
    this.writePos = 0;
    this._size = 0;
  }
}
