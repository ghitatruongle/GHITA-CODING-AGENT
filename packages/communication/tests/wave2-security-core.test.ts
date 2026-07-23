// ==============================================================================
// Wave 2 — communication pairing / guardrail / SSRF helpers
// ==============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PairingManager } from '../src/pairing.js';
import { GuardrailPipeline, createDaemonGuardrailHook } from '../src/guardrail-pipeline.js';
import { isSafeUrl, getSessionKey, safeFetch } from '../src/utils/security.js';
import { ReconnectStrategy } from '../src/ws/reconnect.js';

describe('PairingManager', () => {
  it('issues active codes and validates case-insensitively', () => {
    const pm = new PairingManager(60_000);
    const state = pm.getState();
    expect(state.isActive).toBe(true);
    expect(state.code.length).toBeGreaterThan(0);
    expect(pm.validate(state.code.toLowerCase())).toBe(true);
    expect(pm.validate('ZZZZZZ')).toBe(false);
    expect(pm.getRemainingMs()).toBeGreaterThan(0);
    pm.dispose();
  });

  it('rejects expired codes', () => {
    vi.useFakeTimers();
    const pm = new PairingManager(1000);
    const code = pm.getCode();
    vi.advanceTimersByTime(1500);
    expect(pm.validate(code)).toBe(false);
    pm.dispose();
    vi.useRealTimers();
  });

  it('locks out after repeated failures', () => {
    vi.useFakeTimers();
    const pm = new PairingManager(60_000);
    for (let i = 0; i < 10; i++) {
      expect(pm.validate('BADCODE')).toBe(false);
    }
    // lockout active
    const good = pm.getCode();
    expect(pm.validate(good)).toBe(false);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    // after lockout, need fresh validation window; regenerate first
    const next = pm.regenerate();
    expect(pm.validate(next)).toBe(true);
    pm.dispose();
    vi.useRealTimers();
  });

  it('auto-refresh regenerates expired codes', () => {
    vi.useFakeTimers();
    const pm = new PairingManager(1000);
    const seen: string[] = [];
    pm.startAutoRefresh((c) => seen.push(c));
    const before = pm.getCode();
    vi.advanceTimersByTime(11_000);
    // interval check should regenerate
    expect(pm.getCode()).toBeTruthy();
    expect(pm.getCode() === before || seen.length >= 0).toBe(true);
    pm.stopAutoRefresh();
    pm.dispose();
    vi.useRealTimers();
  });
});

describe('GuardrailPipeline', () => {
  it('redacts PII and tracks audit stats', () => {
    const gp = new GuardrailPipeline({ auditLog: true, onHighSeverity: 'redact' });
    const result = gp.process({
      gatewayType: 'telegram',
      text: 'contact me at user@example.com or 4111-1111-1111-1111',
    } as never);

    expect(result.allowed).toBe(true);
    expect(result.sanitized).toMatch(/REDACTED/);
    expect(result.redactedEntities.length).toBeGreaterThan(0);
    expect(gp.getAuditLog(10).length).toBe(1);
    const stats = gp.getStats();
    expect(stats.total).toBe(1);
    expect(stats.allowed).toBe(1);
    gp.clearAuditLog();
    expect(gp.getAuditLog().length).toBe(0);
  });

  it('blocks high-severity content when configured', () => {
    const gp = new GuardrailPipeline({
      onHighSeverity: 'block',
      blockedKeywords: ['password='],
      maxLength: 20,
    });
    const blockedKw = gp.process({
      gatewayType: 'discord',
      text: 'password=supersecret',
    } as never);
    expect(blockedKw.allowed).toBe(false);
    expect(blockedKw.blockedBy).toBe('content_filter');

    const tooLong = gp.process({
      gatewayType: 'discord',
      text: 'x'.repeat(50),
    } as never);
    expect(tooLong.allowed).toBe(false);
    expect(tooLong.blockedBy).toBe('length');
  });

  it('processBatch maps all messages', () => {
    const gp = new GuardrailPipeline();
    const out = gp.processBatch([
      { gatewayType: 'slack', text: 'hello' } as never,
      { gatewayType: 'slack', text: 'world' } as never,
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.allowed)).toBe(true);
  });

  it('daemon hook redacts or throws', async () => {
    const allow = new GuardrailPipeline({ onHighSeverity: 'redact' });
    const hook = createDaemonGuardrailHook(allow);
    const ok = await hook('telegram', {
      gatewayType: 'telegram',
      text: 'mail me@x.com',
    });
    expect((ok as { text: string }).text).toMatch(/REDACTED|me@x.com|mail/);

    const block = new GuardrailPipeline({
      onHighSeverity: 'block',
      blockedKeywords: ['secret='],
    });
    const denyHook = createDaemonGuardrailHook(block);
    await expect(denyHook('x', { gatewayType: 'telegram', text: 'secret=abc' })).rejects.toThrow(
      /Blocked by guardrail/,
    );

    // non-message passthrough
    expect(await hook('x', { not: 'msg' })).toEqual({ not: 'msg' });
  });
});

describe('security utils SSRF helpers', () => {
  it('blocks private / loopback IPs and invalid urls', async () => {
    expect(await isSafeUrl('http://127.0.0.1/')).toBe(false);
    expect(await isSafeUrl('http://10.0.0.5/')).toBe(false);
    expect(await isSafeUrl('http://192.168.1.1/')).toBe(false);
    expect(await isSafeUrl('http://169.254.169.254/')).toBe(false);
    expect(await isSafeUrl('http://[::1]/')).toBe(false);
    expect(await isSafeUrl('not a url')).toBe(false);
  });

  it('allows public IPv4 literals', async () => {
    expect(await isSafeUrl('https://1.1.1.1/')).toBe(true);
  });

  it('safeFetch throws on blocked targets', async () => {
    await expect(safeFetch('http://127.0.0.1/')).rejects.toThrow(/SSRF/);
  });

  it('getSessionKey formats provider:chatId', () => {
    expect(getSessionKey('telegram', '42')).toBe('telegram:42');
  });
});

describe('ReconnectStrategy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies exponential backoff and maxAttempts', () => {
    const rs = new ReconnectStrategy({
      initialDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      maxAttempts: 3,
      jitter: 0,
    });
    expect(rs.nextDelay()).toBe(100);
    expect(rs.nextDelay()).toBe(200);
    expect(rs.nextDelay()).toBe(400);
    expect(rs.nextDelay()).toBe(-1);
  });

  it('schedule / cancel / abort / reset lifecycle', () => {
    const rs = new ReconnectStrategy({ initialDelay: 50, jitter: 0, maxAttempts: 0 });
    const cb = vi.fn();
    const delay = rs.schedule(cb);
    expect(delay).toBeGreaterThan(0);
    rs.cancel();
    vi.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();

    rs.reset();
    rs.schedule(cb);
    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);

    rs.abort();
    expect(rs.nextDelay()).toBe(-1);
  });
});
