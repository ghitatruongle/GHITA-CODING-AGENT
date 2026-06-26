// ==============================================================================
// GHITA CODING AGENT - Voice Activity Detection Tests
// ==============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VoiceActivityDetector, DEFAULT_VAD_CONFIG } from './vad.js';
import type { AudioChunk } from './types.js';

function silentChunk(): AudioChunk {
  return {
    data: new Uint8Array(new Int16Array(320).buffer),
    encoding: 'pcm_s16le',
    sampleRate: 16000,
    channels: 1,
    timestamp: Date.now(),
  };
}

function loudChunk(): AudioChunk {
  const samples = new Int16Array(320).fill(30000);
  return {
    data: new Uint8Array(samples.buffer),
    encoding: 'pcm_s16le',
    sampleRate: 16000,
    channels: 1,
    timestamp: Date.now(),
  };
}

describe('VoiceActivityDetector', () => {
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    vad = new VoiceActivityDetector({
      silenceThreshold: 0.01,
      silenceDurationMs: 100,
      speechDurationMs: 50,
      smoothingFactor: 0.3,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have default config', () => {
    expect(DEFAULT_VAD_CONFIG.silenceThreshold).toBe(0.01);
    expect(DEFAULT_VAD_CONFIG.speechDurationMs).toBe(150);
  });

  it('should start not speaking', () => {
    expect(vad.speaking).toBe(false);
  });

  it('should emit silence for quiet audio', () => {
    const event = vad.process(silentChunk());
    expect(event).toBe('silence');
  });

  it('should detect speech start', () => {
    vi.advanceTimersByTime(100);
    let event = vad.process(loudChunk());
    // First chunk after advancing time starts speech timer
    vi.advanceTimersByTime(100);
    event = vad.process(loudChunk());
    expect(event).toBe('speech-start');
    expect(vad.speaking).toBe(true);
  });

  it('should detect speech end after silence', () => {
    vi.advanceTimersByTime(100);
    vad.process(loudChunk());
    vi.advanceTimersByTime(100);
    vad.process(loudChunk()); // speech-start
    expect(vad.speaking).toBe(true);

    // Send silent chunks repeatedly until smoothed RMS drops and speech ends
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
      vad.process(silentChunk());
    }
    expect(vad.speaking).toBe(false);
  });

  it('should call registered listeners', () => {
    const listener = vi.fn();
    vad.onEvent(listener);
    vi.advanceTimersByTime(100);
    vad.process(loudChunk());
    vi.advanceTimersByTime(100);
    vad.process(loudChunk()); // speech-start
    expect(listener).toHaveBeenCalledWith('speech-start', expect.any(Number));
  });

  it('should unsubscribe listeners', () => {
    const listener = vi.fn();
    const unsubscribe = vad.onEvent(listener);
    unsubscribe();
    vi.advanceTimersByTime(100);
    vad.process(loudChunk());
    vi.advanceTimersByTime(100);
    vad.process(loudChunk());
    expect(listener).not.toHaveBeenCalled();
  });

  it('should reset state', () => {
    vi.advanceTimersByTime(100);
    vad.process(loudChunk());
    vi.advanceTimersByTime(100);
    vad.process(loudChunk()); // speech-start
    expect(vad.speaking).toBe(true);
    vad.reset();
    expect(vad.speaking).toBe(false);
  });
});
