// ==============================================================================
// v0.4.9 C1/C2/C3: Connection Utilities Unit Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  computeBackoffDelay,
  selectStreamQuality,
  streamQualityForLevel,
  encodePairingPayload,
  decodePairingPayload,
} from './connection.js';

describe('computeBackoffDelay', () => {
  it('grows exponentially and saturates at maxMs', () => {
    const noJitter = { jitter: 0, baseMs: 1000, maxMs: 30_000 };
    expect(computeBackoffDelay(1, noJitter)).toBe(1000);
    expect(computeBackoffDelay(2, noJitter)).toBe(2000);
    expect(computeBackoffDelay(3, noJitter)).toBe(4000);
    expect(computeBackoffDelay(6, noJitter)).toBe(30_000); // 32000 capped
    expect(computeBackoffDelay(100, noJitter)).toBe(30_000);
  });

  it('applies jitter within bounds', () => {
    const withJitter = { jitter: 0.5, baseMs: 1000, maxMs: 30_000, random: () => 0 };
    // jitterFactor = 1 - 0.5 + 0 = 0.5 → 1000 * 0.5 = 500
    expect(computeBackoffDelay(1, withJitter)).toBe(500);
    const highJitter = { jitter: 0.5, baseMs: 1000, maxMs: 30_000, random: () => 1 };
    // jitterFactor = 1 - 0.5 + 1*1 = 1.5 → 1500
    expect(computeBackoffDelay(1, highJitter)).toBe(1500);
  });

  it('never returns negative and floors attempt at 1', () => {
    expect(computeBackoffDelay(0, { jitter: 0 })).toBe(1000);
    expect(computeBackoffDelay(-5, { jitter: 0 })).toBe(1000);
  });
});

describe('selectStreamQuality', () => {
  it('maps RTT to quality tiers', () => {
    expect(selectStreamQuality(50).level).toBe('high');
    expect(selectStreamQuality(200).level).toBe('medium');
    expect(selectStreamQuality(800).level).toBe('low');
  });
  it('defaults to medium for invalid RTT', () => {
    expect(selectStreamQuality(-1).level).toBe('medium');
    expect(selectStreamQuality(NaN).level).toBe('medium');
  });
  it('high tier has higher jpeg quality and fps than low', () => {
    const high = streamQualityForLevel('high');
    const low = streamQualityForLevel('low');
    expect(high.jpegQuality).toBeGreaterThan(low.jpegQuality);
    expect(high.fps).toBeGreaterThan(low.fps);
  });
});

describe('pairing payload codec', () => {
  it('round-trips a full payload', () => {
    const payload = { host: '192.168.1.10', port: 8080, code: 'AB12CD', token: 'seed123' };
    const uri = encodePairingPayload(payload);
    expect(uri.startsWith('ghita://pair?')).toBe(true);
    expect(decodePairingPayload(uri)).toEqual(payload);
  });

  it('round-trips without an optional token', () => {
    const payload = { host: 'localhost', port: 1420, code: 'ZZZZ99' };
    expect(decodePairingPayload(encodePairingPayload(payload))).toEqual(payload);
  });

  it('rejects malformed or non-ghita URIs', () => {
    expect(decodePairingPayload('https://evil.com')).toBeNull();
    expect(decodePairingPayload('ghita://pair?host=x')).toBeNull(); // missing port+code
    expect(decodePairingPayload('ghita://pair?host=x&port=abc&code=AB12CD')).toBeNull();
    expect(decodePairingPayload('ghita://pair?host=x&port=70000&code=AB12CD')).toBeNull();
    expect(decodePairingPayload('ghita://pair?host=x&port=8080&code=!!')).toBeNull();
  });
});
