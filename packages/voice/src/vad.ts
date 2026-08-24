// Energy-threshold based VAD for audio streams

import type { AudioChunk } from './types.js';

export interface VadConfig {
  /** RMS energy threshold below which audio is considered silence (0-1) */
  silenceThreshold: number;
  /** Minimum silence duration (ms) before marking end of speech */
  silenceDurationMs: number;
  /** Minimum speech duration (ms) to trigger a speech start event */
  speechDurationMs: number;
  /** Smoothing factor for RMS calculation (0-1) */
  smoothingFactor: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  silenceThreshold: 0.01,
  silenceDurationMs: 500,
  speechDurationMs: 150,
  smoothingFactor: 0.3,
};

export type VadEvent = 'speech-start' | 'speech-end' | 'silence';
export type VadListener = (event: VadEvent, rms: number) => void;

/**
 * Voice Activity Detector that analyzes audio chunks to detect speech
 * vs. silence using RMS energy levels with smoothing.
 */
export class VoiceActivityDetector {
  private config: VadConfig;
  private listeners = new Set<VadListener>();
  private smoothedRms = 0;
  private speechStartTime = 0;
  private silenceStartTime = 0;
  private isSpeaking = false;

  constructor(config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
  }

  /** Update VAD configuration. */
  configure(config: Partial<VadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Register a VAD event listener. Returns unsubscribe function. */
  onEvent(listener: VadListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whether speech is currently detected. */
  get speaking(): boolean {
    return this.isSpeaking;
  }

  /** Process an audio chunk and emit VAD events. */
  process(chunk: AudioChunk): VadEvent | null {
    const rms = this.computeRms(chunk.data);
    this.smoothedRms =
      this.config.smoothingFactor * rms +
      (1 - this.config.smoothingFactor) * this.smoothedRms;

    const now = Date.now();
    const isAboveThreshold = this.smoothedRms > this.config.silenceThreshold;

    if (isAboveThreshold) {
      this.silenceStartTime = 0;

      if (!this.isSpeaking) {
        if (this.speechStartTime === 0) {
          this.speechStartTime = now;
        } else if (now - this.speechStartTime >= this.config.speechDurationMs) {
          this.isSpeaking = true;
          this.emit('speech-start', this.smoothedRms);
          return 'speech-start';
        }
      }
    } else {
      this.speechStartTime = 0;

      if (this.isSpeaking) {
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = now;
        } else if (now - this.silenceStartTime >= this.config.silenceDurationMs) {
          this.isSpeaking = false;
          this.silenceStartTime = 0;
          this.emit('speech-end', this.smoothedRms);
          return 'speech-end';
        }
      }
    }

    if (!this.isSpeaking && !isAboveThreshold) {
      this.emit('silence', this.smoothedRms);
      return 'silence';
    }

    return null;
  }

  /** Reset the VAD state. */
  reset(): void {
    this.smoothedRms = 0;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.isSpeaking = false;
  }

  private computeRms(data: Uint8Array): number {
    const view = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    if (view.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < view.length; i++) {
      const sample = (view[i] ?? 0) / 32768; // Normalize to -1..1
      sum += sample * sample;
    }
    return Math.sqrt(sum / view.length);
  }

  private emit(event: VadEvent, rms: number): void {
    for (const l of this.listeners) {
      try {
        l(event, rms);
      } catch {
        // ignore
      }
    }
  }
}
