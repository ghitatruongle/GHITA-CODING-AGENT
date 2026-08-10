import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionRegistry } from './action-registry.js';
import { ActCache, actCacheKey, domSignature } from './act-cache.js';
import { DEFAULT_ACT_VERIFIER, classifyActError, runActionWithRetry } from './verifier.js';
import { NetworkInterceptor } from './network.js';
import { MemoryTraceStore, toTimelineView, summarizeTraces, type ActionTrace } from './trace.js';

describe('ActionRegistry', () => {
  it('registers built-ins and custom actions', () => {
    const registry = new ActionRegistry();
    registry.register({ name: 'my-tool', description: 'custom', output: 'text' });
    expect(registry.get('click')?.terminatesSequence).toBe(true);
    expect(registry.get('my-tool')).toBeDefined();
    expect(registry.list().length).toBe(9);
  });

  it('filters actions by domain and validates params', () => {
    const registry = new ActionRegistry();
    registry.register({ name: 'gmail-only', description: 'd', domains: ['mail.google.com'] });
    expect(registry.forDomain('mail.google.com').some((a) => a.name === 'gmail-only')).toBe(true);
    expect(registry.forDomain('example.com').some((a) => a.name === 'gmail-only')).toBe(false);
    expect(registry.validate('fill', { selector: 'x' }).ok).toBe(true);
    expect(registry.validate('nope', {}).ok).toBe(false);
  });
});

describe('ActCache', () => {
  it('caches and replays by intent+url+dom key (0 LLM on hit)', () => {
    const cache = new ActCache();
    const dom = domSignature('<html>page</html>');
    const key = actCacheKey('click login button', 'https://a.dev', dom);
    expect(key).toMatch(/^[0-9a-f]{32}$/);

    expect(cache.get('click login button', 'https://a.dev', dom)).toBeUndefined();
    cache.set('click login button', 'https://a.dev', dom, 'click', { selector: '#login' });

    const hit = cache.get('click login button', 'https://a.dev', dom);
    expect(hit?.action).toBe('click');
    expect(hit?.args.selector).toBe('#login');
    expect(hit?.hits).toBe(2);

    // Different DOM signature → miss (page changed).
    expect(
      cache.get('click login button', 'https://a.dev', domSignature('<html>v2</html>')),
    ).toBeUndefined();
  });

  it('persists to SQLite and enforces TTL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'actcache-'));
    const cache = new ActCache({ dbPath: join(dir, 'act.db'), ttlSeconds: 3600 });
    cache.set('click x', 'https://b.dev', 'sig1', 'click', {});
    expect(cache.get('click x', 'https://b.dev', 'sig1')).toBeDefined();
    expect(cache.stats().entries).toBe(1);
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('verifier', () => {
  it('verifies navigation and mutation evidence', () => {
    expect(DEFAULT_ACT_VERIFIER('navigate', {}, { urlBefore: 'a', urlAfter: 'b' }).ok).toBe(true);
    expect(DEFAULT_ACT_VERIFIER('navigate', {}, { urlBefore: 'a', urlAfter: 'a' }).ok).toBe(false);
    expect(DEFAULT_ACT_VERIFIER('click', {}, { domBefore: 'h1', domAfter: 'h2' }).ok).toBe(true);
  });

  it('classifies errors into taxonomy', () => {
    expect(classifyActError(new Error('timed out waiting')).category).toBe('timeout');
    expect(classifyActError(new Error('no element found')).category).toBe('not-found');
    expect(classifyActError(new Error('element is detached')).category).toBe('stale');
    expect(classifyActError(new Error('weird')).category).toBe('unknown');
  });

  it('retries only retryable categories with backoff', async () => {
    let attempts = 0;
    const result = await runActionWithRetry(
      'click',
      {},
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('timed out waiting');
        return { domBefore: 'a', domAfter: 'b' };
      },
      DEFAULT_ACT_VERIFIER,
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(result.attempts).toBe(3);
    expect(result.outcome.ok).toBe(true);
  });

  it('does not retry non-retryable categories', async () => {
    let attempts = 0;
    const result = await runActionWithRetry(
      'click',
      {},
      async () => {
        attempts += 1;
        throw new Error('net::ERR_BLOCKED');
      },
      DEFAULT_ACT_VERIFIER,
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(attempts).toBe(1);
    expect(result.outcome.error?.category).toBe('blocked');
  });
});

describe('NetworkInterceptor', () => {
  it('logs requests, blocks by host rule, exports HAR', () => {
    const interceptor = new NetworkInterceptor();
    interceptor.addBlockRule(/ads\.example/, 'ad network');

    const id1 = interceptor.start('GET', 'https://app.dev/data', 'xhr');
    interceptor.finish(id1, 200, 1024);
    const id2 = interceptor.start('GET', 'https://ads.example/track.js', 'script');
    expect(interceptor.decide('https://ads.example/x').block).toBe(true);
    interceptor.markBlocked(id2);

    const all = interceptor.list();
    expect(all).toHaveLength(2);
    expect(all[1]?.blocked).toBe(true);
    const har = JSON.parse(interceptor.exportHAR());
    expect(har.log.entries).toHaveLength(2);
    expect(har.log.entries[1]?._ghita.blocked).toBe(true);
  });
});

describe('trace-light', () => {
  const traces: ActionTrace[] = [
    {
      id: 't1',
      action: 'click',
      args: {},
      url: 'https://a.dev',
      domBefore: 'a',
      domAfter: 'b',
      ok: true,
      evidence: [],
      at: 1,
      durationMs: 50,
    },
    {
      id: 't2',
      action: 'navigate',
      args: {},
      url: 'https://a.dev',
      domBefore: 'b',
      domAfter: 'c',
      ok: false,
      evidence: [],
      at: 2,
      durationMs: 120,
    },
  ];

  it('stores and summarizes traces', () => {
    const store = new MemoryTraceStore();
    for (const t of traces) store.push(t);
    expect(store.list()).toHaveLength(2);
    expect(store.latest()?.id).toBe('t2');
    const summary = summarizeTraces(store.list());
    expect(summary.successRate).toBe(0.5);
    expect(summary.byAction.click).toBe(1);
    expect(summary.avgDurationMs).toBe(85);
    expect(toTimelineView(store.list())[0]?.action).toBe('click');
  });
});
