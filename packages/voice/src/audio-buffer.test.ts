// ==============================================================================
// GHITA CODING AGENT - Audio Ring Buffer Tests
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AudioRingBuffer } from './audio-buffer.js';
import type { AudioChunk } from './types.js';

describe('AudioRingBuffer', () => {
  let buffer: AudioRingBuffer;

  beforeEach(() => {
    buffer = new AudioRingBuffer(1000, 16000);
  });

  it('should start empty', () => {
    expect(buffer.size).toBe(0);
    expect(buffer.fillRatio).toBe(0);
    expect(buffer.durationMs).toBe(0);
  });

  it('should push audio samples', () => {
    // Int16Array has 3 elements; Uint8Array wrapper has 6 bytes
    const chunk: AudioChunk = {
      data: new Uint8Array(new Int16Array([100, 200, 300]).buffer),
      encoding: 'pcm_s16le',
      sampleRate: 16000,
      channels: 1,
      timestamp: Date.now(),
    };
    buffer.push(chunk);
    // 3 Int16 samples → 6 bytes in Uint8Array → 6 elements in Int16Array view
    expect(buffer.size).toBe(6);
    expect(buffer.isFull).toBe(false);
  });

  it('should read all samples in order', () => {
    const samples = new Int16Array([10, 20, 30, 40]);
    buffer.pushSamples(samples);
    const read = buffer.readAll();
    expect(read.length).toBe(4);
    expect(read[0]).toBe(10);
    expect(read[3]).toBe(40);
  });

  it('should read last N samples', () => {
    buffer.pushSamples(new Int16Array([1, 2, 3, 4, 5]));
    const last = buffer.readLast(3);
    expect(last).toEqual(new Int16Array([3, 4, 5]));
  });

  it('should wrap around when full', () => {
    const smallBuf = new AudioRingBuffer(4);
    smallBuf.pushSamples(new Int16Array([1, 2, 3, 4]));
    smallBuf.pushSamples(new Int16Array([5, 6]));
    expect(smallBuf.size).toBe(4);
    expect(smallBuf.isFull).toBe(true);
    // Should contain newest 4 samples: 3,4,5,6
    const all = smallBuf.readAll();
    expect(all[0]).toBe(3);
    expect(all[3]).toBe(6);
  });

  it('should compute RMS', () => {
    // Constant amplitude of 32767 should give RMS close to 1.0
    const maxSamples = new Int16Array(100).fill(32767);
    buffer.pushSamples(maxSamples);
    const rms = buffer.computeRms();
    expect(rms).toBeGreaterThan(0.9);
    expect(rms).toBeLessThanOrEqual(1.0);
  });

  it('should return 0 RMS for empty buffer', () => {
    expect(buffer.computeRms()).toBe(0);
  });

  it('should convert to ArrayBuffer', () => {
    buffer.pushSamples(new Int16Array([1, 2, 3]));
    const ab = buffer.toArrayBuffer();
    expect(ab.byteLength).toBe(6); // 3 samples × 2 bytes
  });

  it('should clear', () => {
    buffer.pushSamples(new Int16Array([1, 2, 3]));
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.readAll()).toEqual(new Int16Array(0));
  });

  it('should report duration', () => {
    // At 16000 Hz, 16000 samples = 1 second
    const bigBuf = new AudioRingBuffer(16000);
    bigBuf.pushSamples(new Int16Array(8000)); // 0.5 seconds
    expect(bigBuf.durationMs).toBeCloseTo(500, -1);
  });
});
