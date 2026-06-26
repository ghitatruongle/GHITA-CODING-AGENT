// ==============================================================================
// GHITA CODING AGENT - Usage Tracker Tests
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { UsageTracker } from './usage-tracker.js';

describe('UsageTracker', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker();
  });

  it('should record usage', () => {
    tracker.record({
      userId: 'user1',
      provider: 'openai',
      model: 'gpt-4o',
      promptTokens: 100,
      completionTokens: 50,
    });
    const summary = tracker.summary('user1', Date.now() - 86400000, Date.now() + 86400000);
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalTokens).toBe(150); // 100 + 50 auto-calculated
  });

  it('should calculate cost for known models', () => {
    const cost = tracker.calculateCost('gpt-4o', 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it('should return cost for unknown models (fallback)', () => {
    const cost = tracker.calculateCost('unknown-model', 1000, 500);
    expect(typeof cost).toBe('number');
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('should set custom pricing', () => {
    tracker.setPricing('custom-model', { promptPer1k: 0.01, completionPer1k: 0.03 });
    const cost = tracker.calculateCost('custom-model', 1000, 500);
    expect(cost).toBe(0.01 + 0.015); // 0.01 for prompt + 0.015 for completion
  });

  it('should query records by time range', () => {
    const now = Date.now();
    tracker.record({
      userId: 'user1',
      provider: 'openai',
      model: 'gpt-4o',
      promptTokens: 10,
      completionTokens: 5,
      timestamp: now,
    });
    const results = tracker.query('user1', now - 1000, now + 1000);
    expect(results).toHaveLength(1);
    const empty = tracker.query('user1', now + 10000, now + 20000);
    expect(empty).toHaveLength(0);
  });

  it('should build summary with provider/model breakdown', () => {
    const now = Date.now();
    tracker.record({
      userId: 'user1',
      provider: 'openai',
      model: 'gpt-4o',
      promptTokens: 100,
      completionTokens: 50,
      timestamp: now,
    });
    tracker.record({
      userId: 'user1',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      promptTokens: 200,
      completionTokens: 100,
      timestamp: now,
    });
    const summary = tracker.summary('user1', now - 86400000, now + 86400000);
    expect(summary.totalRequests).toBe(2);
    expect(summary.byProvider['openai']?.tokens).toBe(150);
    expect(summary.byProvider['anthropic']?.tokens).toBe(300);
  });

  it('should enforce max records limit', () => {
    const smallTracker = new UsageTracker({}, 3);
    for (let i = 0; i < 5; i++) {
      smallTracker.record({
        userId: 'user1',
        provider: 'openai',
        model: 'gpt-4o',
        promptTokens: 1,
        completionTokens: 1,
      });
    }
    expect(smallTracker.all().length).toBeGreaterThanOrEqual(3);
  });

  it('should forget user records', () => {
    const now = Date.now();
    tracker.record({
      userId: 'user1',
      provider: 'openai',
      model: 'gpt-4o',
      promptTokens: 1,
      completionTokens: 1,
      timestamp: now,
    });
    tracker.record({
      userId: 'user2',
      provider: 'openai',
      model: 'gpt-4o',
      promptTokens: 1,
      completionTokens: 1,
      timestamp: now,
    });
    tracker.forget('user1');
    expect(tracker.all()).toHaveLength(1);
  });
});
