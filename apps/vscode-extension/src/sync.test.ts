import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSyncId,
  mergeConfig,
  buildFileChangePayload,
  buildFileDeletePayload,
  buildFileRenamePayload,
  buildWorkspaceInventory,
  buildStatusBarModel,
  buildSocketUrl,
  emptyStats,
  recordSend,
  recordReceive,
  recordError,
  DEFAULT_SYNC_CONFIG,
  Debouncer,
} from './sync';

describe('generateSyncId', () => {
  it('produces unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateSyncId());
    expect(ids.size).toBe(1000);
  });

  it('uses provided timestamp and randomness', () => {
    const id = generateSyncId(1700000000000, 0.123456);
    expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
    const parts = id.split('_');
    expect(parts[0]).toBe((1700000000000).toString(36));
  });

  it('has the expected two-segment shape', () => {
    const id = generateSyncId();
    const parts = id.split('_');
    expect(parts).toHaveLength(2);
    expect((parts[0] ?? '').length).toBeGreaterThan(0);
    expect((parts[1] ?? '').length).toBeGreaterThan(0);
  });
});

describe('mergeConfig', () => {
  it('returns defaults when input is undefined/null', () => {
    expect(mergeConfig(undefined)).toEqual(DEFAULT_SYNC_CONFIG);
    expect(mergeConfig(null)).toEqual(DEFAULT_SYNC_CONFIG);
  });

  it('overrides provided keys', () => {
    const merged = mergeConfig({ corePort: 9000, autoSync: false });
    expect(merged.corePort).toBe(9000);
    expect(merged.autoSync).toBe(false);
    expect(merged.debounceMs).toBe(DEFAULT_SYNC_CONFIG.debounceMs);
  });

  it('drops unknown keys', () => {
    const merged = mergeConfig({ corePort: 9000, unknownKey: 'x' } as never);
    expect(
      (merged as unknown as Record<string, unknown>).unknownKey,
    ).toBeUndefined();
  });

  it('drops wrong-typed values', () => {
    const merged = mergeConfig({ corePort: '8080' as unknown as number });
    expect(merged.corePort).toBe(DEFAULT_SYNC_CONFIG.corePort);
  });
});

describe('payload builders', () => {
  const NOW = 1700000000000;

  it('buildFileChangePayload includes all fields', () => {
    const p = buildFileChangePayload('/a/b.ts', 'export const x = 1', 'typescript', 'sid', NOW);
    expect(p).toEqual({
      filePath: '/a/b.ts',
      content: 'export const x = 1',
      languageId: 'typescript',
      timestamp: NOW,
      syncId: 'sid',
    });
  });

  it('buildFileDeletePayload omits content', () => {
    const p = buildFileDeletePayload('/a/b.ts', 'sid', NOW);
    expect(p).toEqual({ filePath: '/a/b.ts', timestamp: NOW, syncId: 'sid' });
  });

  it('buildFileRenamePayload keeps old and new paths', () => {
    const p = buildFileRenamePayload('/old.ts', '/new.ts', 'sid', NOW);
    expect(p).toEqual({ oldPath: '/old.ts', newPath: '/new.ts', timestamp: NOW, syncId: 'sid' });
  });

  it('buildWorkspaceInventory sets correct fileCount', () => {
    const inv = buildWorkspaceInventory('/root', ['/root/a.ts', '/root/b.ts'], 'sid', NOW);
    expect(inv.fileCount).toBe(2);
    expect(inv.files).toHaveLength(2);
    expect(inv.workspaceRoot).toBe('/root');
    expect(inv.timestamp).toBe(NOW);
    const first = inv.files[0];
    expect(first).toMatchObject({ path: '/root/a.ts', languageId: '', sizeBytes: 0 });
  });

  it('buildWorkspaceInventory handles empty input', () => {
    const inv = buildWorkspaceInventory('/root', [], 'sid', NOW);
    expect(inv.fileCount).toBe(0);
    expect(inv.files).toEqual([]);
  });
});

describe('buildStatusBarModel', () => {
  it('connected state has success icon', () => {
    const m = buildStatusBarModel('connected');
    expect(m.text).toContain('Connected');
    expect(m.text).toMatch(/check-all/);
  });

  it('connecting state has spinner icon', () => {
    const m = buildStatusBarModel('connecting');
    expect(m.text).toContain('sync~spin');
  });

  it('reconnecting shows attempt counter', () => {
    const m = buildStatusBarModel('reconnecting', undefined, 7);
    expect(m.text).toContain('(7)');
  });

  it('error uses provided detail in tooltip', () => {
    const m = buildStatusBarModel('error', 'boom');
    expect(m.tooltip).toBe('boom');
  });

  it('disconnected is the default', () => {
    const m = buildStatusBarModel('disconnected');
    expect(m.text).toContain('Offline');
  });
});

describe('buildSocketUrl', () => {
  it('uses 127.0.0.1 with corePort', () => {
    const cfg80 = { ...DEFAULT_SYNC_CONFIG, corePort: 8080 };
    const cfg91 = { ...DEFAULT_SYNC_CONFIG, corePort: 9001 };
    expect(buildSocketUrl(cfg80)).toBe('http://127.0.0.1:8080');
    expect(buildSocketUrl(cfg91)).toBe('http://127.0.0.1:9001');
  });
});

describe('stats helpers', () => {
  it('emptyStats is all zero', () => {
    expect(emptyStats()).toEqual({
      filesSent: 0,
      filesReceived: 0,
      syncErrors: 0,
      lastSyncAt: 0,
      totalBytesSent: 0,
    });
  });

  it('recordSend increments counters and stamps lastSyncAt', () => {
    const start = emptyStats();
    const next = recordSend(start, 1024, 1700000000000);
    expect(next.filesSent).toBe(1);
    expect(next.totalBytesSent).toBe(1024);
    expect(next.lastSyncAt).toBe(1700000000000);
    expect(start.filesSent).toBe(0);
  });

  it('recordReceive increments filesReceived', () => {
    const next = recordReceive(emptyStats());
    expect(next.filesReceived).toBe(1);
  });

  it('recordError increments syncErrors', () => {
    const next = recordError(emptyStats());
    expect(next.syncErrors).toBe(1);
  });
});

describe('Debouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires the callback after delay', () => {
    const fn = vi.fn();
    const d = new Debouncer(100);
    d.schedule(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple schedule calls', () => {
    const fn = vi.fn();
    const d = new Debouncer(100);
    d.schedule(fn);
    vi.advanceTimersByTime(50);
    d.schedule(fn);
    vi.advanceTimersByTime(50);
    d.schedule(fn);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents the pending callback', () => {
    const fn = vi.fn();
    const d = new Debouncer(100);
    d.schedule(fn);
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    expect(d.isPending).toBe(false);
  });

  it('isPending reflects state', () => {
    const d = new Debouncer(100);
    expect(d.isPending).toBe(false);
    d.schedule(() => {});
    expect(d.isPending).toBe(true);
    vi.advanceTimersByTime(100);
    expect(d.isPending).toBe(false);
  });
});
