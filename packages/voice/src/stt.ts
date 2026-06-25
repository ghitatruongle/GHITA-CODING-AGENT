// ==============================================================================
// GHITA CODING AGENT - Speech-to-Text (Phase 34 + Real Provider Support)
// ==============================================================================

import type { SttRequest, SttResult, SttListener } from './types.js';

export type SttProvider = 'whisper-api' | 'local-stub';

export interface SpeechToTextConfig {
  /** STT backend to use. Default: 'local-stub' (deterministic for testing). */
  provider?: SttProvider;
  /** OpenAI API key for Whisper API. Required when provider='whisper-api'. */
  apiKey?: string;
  /** Base URL for Whisper-compatible API. Default: 'https://api.openai.com/v1' */
  baseUrl?: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

/**
 * STT provider abstraction supporting both a deterministic local stub
 * (for testing) and real OpenAI Whisper API calls.
 *
 * Usage:
 *   const stt = new SpeechToText({ provider: 'whisper-api', apiKey: 'sk-...' });
 *   const result = await stt.transcribe({ audio: buffer, model: 'base' });
 */
export class SpeechToText {
  private listeners = new Set<SttListener>();
  private model: SttRequest['model'] = 'base';
  private readonly provider: SttProvider;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: SpeechToTextConfig) {
    this.provider = config?.provider ?? 'local-stub';
    this.apiKey = config?.apiKey;
    this.baseUrl = config?.baseUrl ?? 'https://api.openai.com/v1';
    this.timeoutMs = config?.timeoutMs ?? 30_000;
  }

  setModel(model: NonNullable<SttRequest['model']>): void {
    this.model = model;
  }

  onResult(listener: SttListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Transcribe an audio chunk.
   * Routes to the configured provider (Whisper API or local stub).
   */
  async transcribe(req: SttRequest): Promise<SttResult> {
    let result: SttResult;

    if (this.provider === 'whisper-api' && this.apiKey) {
      result = await this.transcribeViaWhisperApi(req);
    } else {
      result = this.transcribeLocal(req);
    }

    for (const l of this.listeners) {
      try {
        l(result);
      } catch {
        // ignore listener errors
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Real Whisper API integration
  // ---------------------------------------------------------------------------

  private async transcribeViaWhisperApi(req: SttRequest): Promise<SttResult> {
    const durationMs = this.computeDuration(req);

    // Build FormData with the audio blob
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Uint8Array is a valid BlobPart at runtime
    const audioBlob = new Blob([req.audio.data as unknown as BlobPart], { type: 'audio/wav' });
    const form = new FormData();
    form.append('file', audioBlob, 'audio.wav');
    form.append('model', 'whisper-1');
    if (req.language) {
      const langCode = req.language.split('-')[0] ?? req.language;
      form.append('language', langCode);
    }
    if (req.wordTimestamps) form.append('response_format', 'verbose_json');
    else form.append('response_format', 'json');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Whisper API ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as Record<string, unknown>;
      const text = (data.text as string) ?? '';
      const detectedLanguage = (data.language as string) ?? req.language ?? 'en';

      const result: SttResult = {
        text,
        language: detectedLanguage,
        confidence: 0.9,
        durationMs,
      };

      // Extract word-level timestamps if available
      if (req.wordTimestamps && Array.isArray(data.words)) {
        result.words = (data.words as Array<Record<string, unknown>>).map((w) => ({
          word: (w.word as string) ?? '',
          startMs: Math.round(((w.start as number) ?? 0) * 1000),
          endMs: Math.round(((w.end as number) ?? 0) * 1000),
          confidence: (w.confidence as number) ?? 0.9,
        }));
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------------------------------------------------------
  // Local deterministic stub (for testing / offline)
  // ---------------------------------------------------------------------------

  private transcribeLocal(req: SttRequest): SttResult {
    const modelConfidence: Record<string, number> = {
      tiny: 0.5,
      base: 0.7,
      small: 0.8,
      medium: 0.9,
      'large-v3': 0.95,
    };
    const durationMs = this.computeDuration(req);
    const text = this.fakeTranscript(req.audio.data.byteLength, req.language ?? 'en-US');
    const result: SttResult = {
      text,
      language: req.language ?? 'en-US',
      confidence: modelConfidence[req.model ?? this.model ?? 'base'] ?? 0.7,
      durationMs,
    };
    if (req.wordTimestamps) {
      result.words = this.fakeWordTimings(result.text, durationMs);
    }
    return result;
  }

  private computeDuration(req: SttRequest): number {
    const bytesPerSample = 2; // 16-bit PCM
    return (
      (req.audio.data.byteLength /
        (req.audio.sampleRate * req.audio.channels * bytesPerSample)) *
      1000
    );
  }

  private fakeTranscript(bytes: number, lang: string): string {
    const samples = lang.startsWith('vi')
      ? ['xin chào', 'tôi cần hỗ trợ', 'cảm ơn bạn']
      : ['hello there', 'please help me', 'thanks for that'];
    const idx = Math.abs(Math.floor(bytes / 1024)) % samples.length;
    return samples[idx] ?? '';
  }

  private fakeWordTimings(text: string, totalMs: number): NonNullable<SttResult['words']> {
    const words = text.split(/\s+/);
    const per = totalMs / words.length;
    return words.map((w, i) => ({
      word: w,
      startMs: Math.round(i * per),
      endMs: Math.round((i + 1) * per),
      confidence: 0.9,
    }));
  }
}
