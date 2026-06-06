// ==============================================================================
// GHITA CODING AGENT - Speech-to-Text (Phase 34)
// ==============================================================================

import type { SttRequest, SttResult, SttListener } from './types.js';

/**
 * STT provider abstraction. In production this would call OpenAI Whisper, local
 * whisper.cpp, Deepgram, etc. The default implementation is a deterministic stub
 * that derives a fake transcript from the audio size to keep pipelines testable.
 */
export class SpeechToText {
  private listeners = new Set<SttListener>();
  private model: SttRequest['model'] = 'base';

  setModel(model: NonNullable<SttRequest['model']>): void {
    this.model = model;
  }

  onResult(listener: SttListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Transcribe an audio chunk.
   */
  async transcribe(req: SttRequest): Promise<SttResult> {
    const modelSize: Record<NonNullable<SttRequest['model']>, number> = {
      tiny: 0.5,
      base: 0.7,
      small: 0.8,
      medium: 0.9,
      'large-v3': 0.95,
    };
    const durationMs = (req.audio.data.byteLength / (req.audio.sampleRate * req.audio.channels * 2)) * 1000;
    const text = this.fakeTranscript(req.audio.data.byteLength, req.language ?? 'en-US');
    const result: SttResult = {
      text,
      language: req.language ?? 'en-US',
      confidence: modelSize[req.model ?? this.model ?? 'base'] ?? 0.7,
      durationMs,
    };
    if (req.wordTimestamps) {
      result.words = this.fakeWordTimings(result.text, durationMs);
    }
    for (const l of this.listeners) {
      try {
        l(result);
      } catch {
        // ignore
      }
    }
    return result;
  }

  private fakeTranscript(bytes: number, lang: string): string {
    const samples = lang.startsWith('vi') ? ['xin chào', 'tôi cần hỗ trợ', 'cảm ơn bạn'] : ['hello there', 'please help me', 'thanks for that'];
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
