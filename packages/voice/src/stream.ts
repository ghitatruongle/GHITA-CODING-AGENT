import type { AudioChunk, AudioListener } from './types.js';

/**
 * Pipeline that takes raw microphone chunks and emits:
 *   - downsampled chunks (16 kHz mono) for STT
 *   - silence-trimmed chunks for wake-word detection
 * Real VAD/silero integration would replace the simple RMS-based trim.
 */
export class AudioStream {
  private listeners = new Set<AudioListener>();
  private rmsFloor: number;
  private targetSampleRate: number;

  constructor(opts: { rmsFloor?: number; targetSampleRate?: number } = {}) {
    this.rmsFloor = opts.rmsFloor ?? 0.01;
    this.targetSampleRate = opts.targetSampleRate ?? 16_000;
  }

  onChunk(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Push a chunk into the pipeline. The pipeline emits:
   *   - a 16 kHz mono version (always)
   *   - a silence-trimmed version (when audio is active)
   */
  push(chunk: AudioChunk): { normalized: AudioChunk; trimmed: AudioChunk | null } {
    const normalized = this.normalize(chunk);
    const trimmed = this.isSilent(normalized) ? null : normalized;
    for (const l of this.listeners) {
      try {
        l(normalized);
      } catch {
        // ignore
      }
    }
    return { normalized, trimmed };
  }

  private normalize(chunk: AudioChunk): AudioChunk {
    if (chunk.sampleRate === this.targetSampleRate && chunk.channels === 1) {
      return chunk;
    }
    // Cheap resample: just resample by integer ratio. Production: use SpeexDSP/sox.
    const ratio = chunk.sampleRate / this.targetSampleRate;
    const inLen = chunk.data.byteLength / 2;
    const outLen = Math.floor(inLen / ratio);
    const src = new Int16Array(chunk.data.buffer, chunk.data.byteOffset, inLen);
    const dst = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      dst[i] = src[Math.floor(i * ratio)] ?? 0;
    }
    return {
      data: new Uint8Array(dst.buffer),
      encoding: 'pcm_s16le',
      sampleRate: this.targetSampleRate,
      channels: 1,
      timestamp: chunk.timestamp,
    };
  }

  private isSilent(chunk: AudioChunk): boolean {
    if (chunk.data.byteLength === 0) return true;
    const view = new Int16Array(
      chunk.data.buffer,
      chunk.data.byteOffset,
      chunk.data.byteLength / 2,
    );
    let acc = 0;
    for (let i = 0; i < view.length; i++) {
      const v = (view[i] ?? 0) / 32768;
      acc += v * v;
    }
    const rms = Math.sqrt(acc / view.length);
    return rms < this.rmsFloor;
  }
}
