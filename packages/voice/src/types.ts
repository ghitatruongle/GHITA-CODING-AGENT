/** Audio encoding */
export type AudioEncoding = 'pcm_s16le' | 'pcm_f32le' | 'opus' | 'mp3' | 'wav';

/** Audio sample chunk */
export interface AudioChunk {
  /** Raw bytes */
  data: Uint8Array;
  /** Encoding */
  encoding: AudioEncoding;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels (1=mono, 2=stereo) */
  channels: number;
  /** Capture timestamp */
  timestamp: number;
}

/** STT (speech-to-text) request */
export interface SttRequest {
  /** Audio to transcribe */
  audio: AudioChunk;
  /** Source language (BCP-47, e.g. "en-US", "vi-VN") */
  language?: string;
  /** Model hint: "tiny" | "base" | "small" | "medium" | "large-v3" */
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';
  /** Whether to include per-word timestamps */
  wordTimestamps?: boolean;
}

/** STT result */
export interface SttResult {
  /** Transcribed text */
  text: string;
  /** Detected language (BCP-47) */
  language: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Per-word timestamps (if requested) */
  words?: Array<{ word: string; startMs: number; endMs: number; confidence: number }>;
  /** Total duration in ms */
  durationMs: number;
}

/** TTS (text-to-speech) request */
export interface TtsRequest {
  /** Text to speak */
  text: string;
  /** Voice ID (provider-specific) */
  voice: string;
  /** Target encoding */
  encoding?: AudioEncoding;
  /** Target sample rate */
  sampleRate?: number;
  /** Speaking rate multiplier (0.5-2.0) */
  rate?: number;
  /** Pitch shift semitones (-12..12) */
  pitch?: number;
}

/** TTS result */
export interface TtsResult {
  audio: AudioChunk;
  /** Provider used */
  provider: string;
  /** Voice used */
  voice: string;
  /** Duration in ms */
  durationMs: number;
}

/** Wake-word event */
export interface WakeWordEvent {
  /** Detected word (e.g. "Hey Ghita") */
  word: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Timestamp */
  timestamp: number;
  /** Audio right before the wake word */
  preRoll: AudioChunk;
}

/** Wake-word config */
export interface WakeWordConfig {
  /** Phrase to detect */
  phrase: string;
  /** Detection threshold (0-1) */
  threshold: number;
  /** Whether to pre-roll capture audio */
  preRollMs: number;
}

export type SttListener = (r: SttResult) => void;
export type TtsListener = (r: TtsResult) => void;
export type WakeWordListener = (e: WakeWordEvent) => void;
export type AudioListener = (c: AudioChunk) => void;
