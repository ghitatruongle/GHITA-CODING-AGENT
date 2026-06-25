// ==============================================================================
// GHITA CODING AGENT - Wake-Word Detection (Phase 34)
// ==============================================================================

import type { AudioChunk, WakeWordConfig, WakeWordEvent, WakeWordListener } from './types.js';

/**
 * Watches a continuous audio stream for a configured wake phrase.
 * Uses a simple energy + cadence heuristic so the module works without ML deps.
 */
export class WakeWordDetector {
  private config: WakeWordConfig;
  private listeners = new Set<WakeWordListener>();
  private buffer: AudioChunk[] = [];
  private lastTriggerAt = 0;
  private readonly cooldownMs = 1500;

  constructor(config: WakeWordConfig) {
    this.config = config;
  }

  /**
   * Update config at runtime.
   */
  configure(config: Partial<WakeWordConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Subscribe to wake-word detections.
   */
  onDetect(listener: WakeWordListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Feed an audio chunk into the detector.
   */
  feed(chunk: AudioChunk): WakeWordEvent | undefined {
    this.buffer.push(chunk);
    while (this.buffer.length > 64) this.buffer.shift();

    const now = Date.now();
    if (now - this.lastTriggerAt < this.cooldownMs) return undefined;

    const rms = this.computeRms(chunk);
    const isSpeech = rms > 0.05;
    if (!isSpeech) return undefined;

    // Heuristic: if we have a continuous speech burst over ~700ms, fire.
    const windowMs = 700;
    const recent = this.buffer.slice(-8);
    if (recent.length < 4) return undefined;
    const oldest = recent[0]?.timestamp ?? 0;
    if (now - oldest < windowMs) return undefined;

    this.lastTriggerAt = now;
    const preRoll = this.concatChunks(recent);
    const ev: WakeWordEvent = {
      word: this.config.phrase,
      confidence: Math.min(1, rms * 2),
      timestamp: now,
      preRoll,
    };
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch {
        // ignore
      }
    }
    return ev;
  }

  private computeRms(chunk: AudioChunk): number {
    if (chunk.data.byteLength === 0) return 0;
    let acc = 0;
    const view = new Int16Array(
      chunk.data.buffer,
      chunk.data.byteOffset,
      chunk.data.byteLength / 2,
    );
    for (let i = 0; i < view.length; i++) {
      const v = (view[i] ?? 0) / 32768;
      acc += v * v;
    }
    return Math.sqrt(acc / view.length);
  }

  private concatChunks(chunks: AudioChunk[]): AudioChunk {
    const total = chunks.reduce((acc, c) => acc + c.data.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c.data, off);
      off += c.data.byteLength;
    }
    return {
      data: out,
      encoding: chunks[0]?.encoding ?? 'pcm_s16le',
      sampleRate: chunks[0]?.sampleRate ?? 16000,
      channels: chunks[0]?.channels ?? 1,
      timestamp: chunks[0]?.timestamp ?? 0,
    };
  }
}
