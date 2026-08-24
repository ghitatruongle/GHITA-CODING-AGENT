// v0.4.9: ObservabilityManager time-range metric filtering tests

import { describe, it, expect } from 'vitest';
import { ObservabilityManager } from '../src/enterprise/observability.js';

function mgr() {
  return new ObservabilityManager({ provider: 'custom', enabled: true, flushIntervalMs: 0 });
}

const base = {
  model: 'gpt-4o',
  provider: 'openai',
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  latencyMs: 100,
};

describe('ObservabilityManager.getMetrics time filtering', () => {
  it('filters by startTime using the real recordedAt timestamp', () => {
    const m = mgr();
    const old = 1_000_000;
    const recent = 2_000_000;
    m.recordLLMCall({ ...base, recordedAt: old });
    m.recordLLMCall({ ...base, recordedAt: recent });

    const all = m.getMetrics();
    expect(all.totalCalls).toBe(2);

    const afterMid = m.getMetrics({ startTime: new Date(recent - 1) });
    expect(afterMid.totalCalls).toBe(1);
  });

  it('filters by endTime', () => {
    const m = mgr();
    m.recordLLMCall({ ...base, recordedAt: 1_000_000 });
    m.recordLLMCall({ ...base, recordedAt: 2_000_000 });
    const beforeMid = m.getMetrics({ endTime: new Date(1_000_000 + 1) });
    expect(beforeMid.totalCalls).toBe(1);
  });

  it('supports a start+end window', () => {
    const m = mgr();
    m.recordLLMCall({ ...base, recordedAt: 1_000 });
    m.recordLLMCall({ ...base, recordedAt: 5_000 });
    m.recordLLMCall({ ...base, recordedAt: 9_000 });
    const windowed = m.getMetrics({ startTime: new Date(4_000), endTime: new Date(6_000) });
    expect(windowed.totalCalls).toBe(1);
  });

  it('auto-stamps recordedAt when omitted so metrics remain filterable', () => {
    const m = mgr();
    const before = Date.now();
    m.recordLLMCall({ ...base });
    const after = Date.now();
    // A window covering "now" should include the auto-stamped metric.
    const win = m.getMetrics({ startTime: new Date(before - 1), endTime: new Date(after + 1) });
    expect(win.totalCalls).toBe(1);
  });
});
