// v0.4.9: PluginUpdater real-registry check tests

import { describe, it, expect, vi } from 'vitest';
import { PluginUpdater, type FetchLike } from './updater.js';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('PluginUpdater.checkForUpdate (real registry)', () => {
  it('reports no update when no registry is configured (no fabrication)', async () => {
    const updater = new PluginUpdater();
    const r = await updater.checkForUpdate('acme.plugin', '1.2.3');
    expect(r.updateAvailable).toBe(false);
    expect(r.latestVersion).toBe('1.2.3');
    expect(r.changelog).toBe('');
  });

  it('detects a newer version from the registry and notifies', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ version: '1.3.0', changelog: 'Real notes', size: 2048, releasedAt: 111 }),
    );
    const updater = new PluginUpdater({ registryUrl: 'https://reg.example', fetchImpl });
    const notes: string[] = [];
    updater.onUpdate((n) => notes.push(n.message ?? ''));

    const r = await updater.checkForUpdate('acme.plugin', '1.2.3');
    expect(r.updateAvailable).toBe(true);
    expect(r.latestVersion).toBe('1.3.0');
    expect(r.changelog).toBe('Real notes');
    expect(r.size).toBe(2048);
    expect(notes.some((m) => m.includes('1.2.3 → 1.3.0'))).toBe(true);
    const reqUrl = (fetchImpl.mock.calls[0] as unknown as [string])[0];
    expect(reqUrl).toContain('/plugins/acme.plugin/latest');
  });

  it('reports no update when the registry version is not newer', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ version: '1.2.3' }));
    const updater = new PluginUpdater({ registryUrl: 'https://reg.example', fetchImpl });
    const r = await updater.checkForUpdate('acme.plugin', '1.2.3');
    expect(r.updateAvailable).toBe(false);
  });

  it('skips a major bump unless includeMajor is opted in', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ version: '2.0.0' }));
    const updater = new PluginUpdater({ registryUrl: 'https://reg.example', fetchImpl });
    const r = await updater.checkForUpdate('acme.plugin', '1.2.3');
    expect(r.isMajor).toBe(true);
    expect(r.updateAvailable).toBe(false);
    const r2 = await updater.checkForUpdate('acme.plugin2', '1.2.3', { includeMajor: true });
    expect(r2.updateAvailable).toBe(true);
  });

  it('reports no update when the registry request fails', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({}, false, 500));
    const updater = new PluginUpdater({ registryUrl: 'https://reg.example', fetchImpl });
    const r = await updater.checkForUpdate('acme.plugin', '1.2.3');
    expect(r.updateAvailable).toBe(false);
  });

  it('reports no update when fetch throws', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error('network down');
    });
    const updater = new PluginUpdater({ registryUrl: 'https://reg.example', fetchImpl });
    const r = await updater.checkForUpdate('acme.plugin', '1.2.3');
    expect(r.updateAvailable).toBe(false);
  });

  it('serves a cached result within the TTL without re-fetching', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      // releasedAt is far in the past — must NOT be used as the cache clock.
      jsonResponse({ version: '1.3.0', releasedAt: 1 }),
    );
    const updater = new PluginUpdater({ registryUrl: 'https://reg.example', fetchImpl });
    const a = await updater.checkForUpdate('acme.plugin', '1.2.3');
    const b = await updater.checkForUpdate('acme.plugin', '1.2.3');
    expect(a.latestVersion).toBe('1.3.0');
    expect(b.latestVersion).toBe('1.3.0');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // second call hit the cache
  });
});
