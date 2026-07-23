// Wave 3b AntiSlop + circuit
import { describe, it, expect } from 'vitest';
import { AntiSlopFilter } from '../src/middleware/antiSlop.js';
import { DynamicFallbackRouter } from '../src/router/fallback.js';

describe('AntiSlopFilter', () => {
  it('cleanChunk strips leading filler phrases', () => {
    const f = new AntiSlopFilter({ trackSavings: true, minMatchLength: 5 });
    const r = f.cleanChunk('Certainly! The answer is 42.');
    expect(r.charsRemoved).toBeGreaterThan(0);
    expect(r.cleaned.toLowerCase()).not.toMatch(/^certainly/);
    expect(r.matchedPatterns.length).toBeGreaterThan(0);
  });

  it('does not strip inside code fences', () => {
    const f = new AntiSlopFilter();
    f.resetCodeBlockState();
    const fence = String.fromCharCode(96, 96, 96);
    const text = [`${fence  }ts`, 'Certainly! not slop here', fence, 'Certainly! outside'].join(
      String.fromCharCode(10),
    );
    const r = f.cleanWithCodeBlockAwareness(text);
    expect(r.cleaned).toContain('Certainly! not slop here');
    const last = r.cleaned.toLowerCase().split(String.fromCharCode(10)).at(-1) ?? '';
    expect(last).not.toMatch(/^certainly/);
  });

  it('exposes savings summary APIs', () => {
    const f = new AntiSlopFilter({ trackSavings: true });
    f.cleanChunk('I hope this helps! Done.');
    const summary = f.getSavingsSummary();
    expect(summary).toHaveProperty('totalSaved');
    expect(Array.isArray(f.getSavingsLogs())).toBe(true);
    expect(f.getAcMatcher()).toBeTruthy();
  });
});

describe('DynamicFallbackRouter circuit helpers', () => {
  it('uses emergency target and reports circuit status', async () => {
    const router = new DynamicFallbackRouter({
      chain: [{ id: 'only', provider: 'openai', model: 'm' }],
      dynamicReorder: false,
      retry: { maxRetries: 0, jitter: false, baseDelayMs: 1 },
      circuitBreaker: { failureThreshold: 1, openDurationMs: 60000 },
      emergencyTarget: { id: 'em', provider: 'google', model: 'g' },
    });
    await expect(
      router.execute(async (t) => {
        if (t.id === 'only') throw new Error('boom');
        return 'ok';
      }),
    ).resolves.toMatchObject({ result: 'ok', target: { id: 'em' } });
    expect(Array.isArray(router.getCircuitStatus())).toBe(true);
  });
});
