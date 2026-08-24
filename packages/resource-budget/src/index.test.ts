import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BudgetRegistry,
  MemoryMonitor,
  ChatHistoryBudget,
  ScrollbackBudget,
  ScreenPreviewBudget,
} from './index.js';

afterEach(() => vi.restoreAllMocks());

describe('BudgetRegistry', () => {
  it('denies unregistered modules and enforces caps', () => {
    const registry = new BudgetRegistry();
    expect(registry.account('unknown-module', 100)).toBe(false);
    registry.register({ module: 'ai-engine.cache', maxBytes: 1000 });
    expect(registry.account('ai-engine.cache', 600)).toBe(true);
    expect(registry.account('ai-engine.cache', 600)).toBe(false); // over → rolled back
    expect(registry.state('ai-engine.cache')?.usedBytes).toBe(1000); 
    expect(registry.violations()).toHaveLength(1);
    expect(registry.state('ai-engine.cache')?.over).toBe(false); // hard limit rollback
  });

  it('supports soft limits', () => {
    const registry = new BudgetRegistry();
    registry.register({ module: 'cache', maxBytes: 100, hardLimit: false });
    registry.account('cache', 200);
    expect(registry.state('cache')?.usedBytes).toBe(200);
  });
});

describe('MemoryMonitor', () => {
  it('samples memory and alerts on caps', () => {
    const alerts: string[] = [];
    const monitor = new MemoryMonitor(
      {
        heapCapBytes: 10,
        rssCapBytes: 10,
        onAlert: (kind) => alerts.push(kind),
      },
      () => ({ heapUsed: 100, heapTotal: 200, rss: 150, external: 0, arrayBuffers: 0 }),
    );
    monitor.sample();
    expect(alerts).toContain('heap');
    expect(monitor.stats().alerts).toBeGreaterThan(0);
  });

  it('reports budget overruns via checkBudgets', () => {
    const registry = new BudgetRegistry();
    registry.register({ module: 'x', maxBytes: 10, hardLimit: false });
    registry.account('x', 50);
    const alerts: string[] = [];
    const monitor = new MemoryMonitor(
      {
        heapCapBytes: 10_000,
        checkBudgets: () => registry.listStates(),
        onAlert: (kind) => alerts.push(kind),
      },
      () => ({ heapUsed: 1, heapTotal: 2, rss: 3, external: 0, arrayBuffers: 0 }),
    );
    monitor.sample();
    expect(alerts).toContain('budget');
  });
});

describe('ChatHistoryBudget', () => {
  it('caps messages, per-message length and total', () => {
    const budget = new ChatHistoryBudget({
      maxMessages: 2,
      maxCharsPerMessage: 10,
      maxTotalChars: 15,
    });
    const messages: Array<{ role: string; content: string }> = [];
    expect(budget.push(messages, 'user', 'hello')).toBe(true);
    expect(budget.push(messages, 'assistant', 'x'.repeat(16))).toBe(false); // total > 15
    expect(messages).toHaveLength(1);
    expect(budget.push(messages, 'user', 'x'.repeat(11))).toBe(false); // per-message cap
    const full = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ];
    expect(budget.push(full, 'user', 'c')).toBe(false); // max messages
  });
});

describe('ScrollbackBudget', () => {
  it('enforces line and byte caps with eviction', () => {
    const budget = new ScrollbackBudget({ maxLines: 3, maxBytes: 10 });
    expect(budget.push('abc')).toBe(true);
    expect(budget.push('def')).toBe(true);
    expect(budget.push('ghi')).toBe(true);
    expect(budget.push('jkl')).toBe(false); // line cap
    expect(budget.size()).toEqual({ lines: 3, bytes: 9 });
    budget.evict(1);
    expect(budget.size().lines).toBe(1);
  });
});

describe('ScreenPreviewBudget', () => {
  it('limits fps and frame size', () => {
    const budget = new ScreenPreviewBudget({
      maxFps: 10,
      maxBytesPerFrame: 100,
      maxBufferedFrames: 3,
    });
    expect(budget.maxBufferedFrames()).toBe(3);
    expect(budget.acceptFrame(50, Date.now() - 200).ok).toBe(true);
    expect(budget.acceptFrame(50, Date.now() - 50).ok).toBe(false); 
    expect(budget.acceptFrame(150, Date.now() - 200).ok).toBe(false); 
  });
});
