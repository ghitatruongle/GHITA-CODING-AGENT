import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MemoryTerminalSessionStore,
  FileTerminalSessionStore,
  FlowControl,
  TerminalResizeManager,
  type TerminalSnapshot,
} from './index.js';

describe('TerminalSessionStore', () => {
  it('memory store saves and restores latest per session', () => {
    const store = new MemoryTerminalSessionStore();
    const snap: TerminalSnapshot = {
      id: 's1:1',
      buffer: '\x1b[31mred\x1b[0m',
      cols: 80,
      rows: 24,
      cwd: '/repo',
      createdAt: 1,
    };
    store.save(snap);
    store.save({ ...snap, id: 's1:2', buffer: 'newer', createdAt: 2 });
    expect(store.latest('s1')?.buffer).toBe('newer');
    expect(store.list()).toHaveLength(2);
    expect(store.remove('s1:1')).toBe(true);
  });

  it('file store persists across instances (restore on reconnect)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'term-file-'));
    const file = join(dir, 'sessions.json');
    const store = new FileTerminalSessionStore(file);
    store.save({
      id: 's9:1',
      buffer: 'vt-sequences',
      cols: 100,
      rows: 30,
      cwd: '/x',
      createdAt: 1,
    });
    expect(existsSync(file)).toBe(true);

    const reloaded = new FileTerminalSessionStore(file);
    expect(reloaded.latest('s9')?.buffer).toBe('vt-sequences');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('FlowControl', () => {
  it('pauses on XOFF and resumes on XON', () => {
    const fc = new FlowControl();
    const chunk = Buffer.from('abc\x13def');
    const first = fc.feed(chunk);
    expect(first.action).toBe('pause');
    expect(fc.isPaused()).toBe(true);
    expect(first.rest.toString()).toBe('def'); // rest delivered after resume

    const second = fc.feed(Buffer.from('\x11ghi'));
    expect(second.action).toBe('resume');
    expect(fc.isPaused()).toBe(false);
    expect(fc.shouldBackpressure()).toBe(false);
  });

  it('reports backpressure while paused', () => {
    const fc = new FlowControl();
    fc.feed(Buffer.from('\x13'));
    expect(fc.shouldBackpressure()).toBe(true);
  });
});

describe('TerminalResizeManager', () => {
  it('clamps sizes and passes pixels', () => {
    const manager = new TerminalResizeManager({ cols: 80, rows: 24 });
    const size = manager.resize({ cols: 1000, rows: -5, pixelWidth: 800, pixelHeight: 500 });
    expect(size.cols).toBe(500);
    expect(size.rows).toBe(1);
    expect(size.pixelWidth).toBe(800);
  });

  it('fits from pixel dimensions', () => {
    const manager = new TerminalResizeManager({ cols: 80, rows: 24 });
    const size = manager.fitFromPixels(800, 600, 8, 16);
    expect(size.cols).toBe(100);
    expect(size.rows).toBe(37);
  });
});
describe('terminal edge cases (v1.1.0 Track 10 R6)', () => {
  it('FlowControl with empty and single-byte buffers', () => {
    const fc = new FlowControl();
    expect(fc.feed(Buffer.alloc(0)).rest.length).toBe(0);
    expect(fc.feed(Buffer.from([0x13])).action).toBe('pause');
    expect(fc.feed(Buffer.from([0x11])).action).toBe('resume');
  });

  it('resize clamps to min/max bounds', () => {
    const manager = new TerminalResizeManager({ cols: 80, rows: 24 });
    const min = manager.resize({ cols: 0, rows: 0 });
    expect(min.cols).toBe(2);
    expect(min.rows).toBe(1);
    const max = manager.resize({ cols: 9999, rows: 9999 });
    expect(max.cols).toBe(500);
    expect(max.rows).toBe(300);
  });

  it('file store tolerates missing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'term-edge-'));
    const store = new FileTerminalSessionStore(join(dir, 'nope', 'sessions.json'));
    expect(store.list()).toHaveLength(0);
    expect(store.latest('x')).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});
