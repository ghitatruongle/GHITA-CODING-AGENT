import type { AudioChunk, TtsRequest, TtsResult, TtsListener } from './types.js';

/** A TTS provider implementation. */
export interface TtsProvider {
  /** Provider name */
  readonly name: string;
  /** Available voice IDs */
  listVoices(): Promise<string[]>;
  /** Synthesize speech */
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

/**
 * Provider-agnostic TTS facade. Swap providers by registering them and selecting
 * per-request. Default provider is a no-network stub that returns silent PCM.
 */
export class TextToSpeech {
  private providers = new Map<string, TtsProvider>();
  private defaultProvider: string | undefined;
  private listeners = new Set<TtsListener>();

  registerProvider(provider: TtsProvider): void {
    this.providers.set(provider.name, provider);
    if (!this.defaultProvider) this.defaultProvider = provider.name;
  }

  setDefault(name: string): void {
    if (!this.providers.has(name)) throw new Error(`Unknown provider: ${name}`);
    this.defaultProvider = name;
  }

  onResult(listener: TtsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * List voices across all providers.
   */
  async listVoices(providerName?: string): Promise<Array<{ provider: string; voice: string }>> {
    const names = providerName ? [providerName] : Array.from(this.providers.keys());
    const out: Array<{ provider: string; voice: string }> = [];
    for (const n of names) {
      const p = this.providers.get(n);
      if (!p) continue;
      const voices = await p.listVoices();
      for (const v of voices) out.push({ provider: n, voice: v });
    }
    return out;
  }

  /**
   * Synthesize via the default (or named) provider.
   */
  async speak(req: TtsRequest, providerName?: string): Promise<TtsResult> {
    const name = providerName ?? this.defaultProvider;
    if (!name) throw new Error('No TTS provider registered');
    const p = this.providers.get(name);
    if (!p) throw new Error(`Provider not found: ${name}`);
    const result = await p.synthesize(req);
    for (const l of this.listeners) {
      try {
        l(result);
      } catch {
        // ignore
      }
    }
    return result;
  }
}

/**
 * Stub TTS provider returning silent PCM. Useful for tests and offline mode.
 */
export class SilentTtsProvider implements TtsProvider {
  readonly name = 'silent';
  async listVoices(): Promise<string[]> {
    return ['silent-default'];
  }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const sampleRate = req.sampleRate ?? 22_050;
    const channels = 1;
    const encoding = req.encoding ?? 'pcm_s16le';
    const durationMs = req.text.length * 60; // 60ms per char
    const numSamples = Math.floor((sampleRate * durationMs) / 1000);
    const data = new Uint8Array(numSamples * 2);
    const audio: AudioChunk = { data, encoding, sampleRate, channels, timestamp: Date.now() };
    return { audio, provider: this.name, voice: req.voice, durationMs };
  }
}
