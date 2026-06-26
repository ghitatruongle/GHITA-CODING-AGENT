// ==============================================================================
// GHITA CODING AGENT - Alert Engine Tests
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlertEngine } from './alert-rules.js';
import type { CapturedError } from './types.js';

function makeEvent(overrides: Partial<CapturedError> & { id: string }): CapturedError {
  return {
    type: 'Error',
    message: 'test error',
    severity: 'error',
    fingerprint: 'fp1',
    timestamp: Date.now(),
    context: {},
    ...overrides,
  };
}

describe('AlertEngine', () => {
  let engine: AlertEngine;

  beforeEach(() => {
    engine = new AlertEngine();
  });

  it('should evaluate a rule and trigger alert', () => {
    const onTrigger = vi.fn();
    engine.addRule({
      id: 'rule1',
      name: 'High Error Rate',
      pattern: 'test.*',
      minSeverity: 'error',
      threshold: 2,
      windowMs: 60000,
      cooldownMs: 0,
      onTrigger,
      enabled: true,
    });
    engine.evaluate(makeEvent({ id: 'e1', message: 'test error 1' }));
    engine.evaluate(makeEvent({ id: 'e2', message: 'test error 2' }));
    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it('should not trigger below threshold', () => {
    const onTrigger = vi.fn();
    engine.addRule({
      id: 'rule1',
      name: 'Test',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 5,
      windowMs: 60000,
      cooldownMs: 0,
      onTrigger,
      enabled: true,
    });
    engine.evaluate(makeEvent({ id: 'e1', message: 'error' }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('should respect cooldown period', () => {
    const onTrigger = vi.fn();
    engine.addRule({
      id: 'rule1',
      name: 'Test',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 5000,
      onTrigger,
      enabled: true,
    });
    engine.evaluate(makeEvent({ id: 'e1', message: 'error' }));
    engine.evaluate(makeEvent({ id: 'e2', message: 'error' }));
    expect(onTrigger).toHaveBeenCalledTimes(1); // Only first triggers, second is in cooldown
  });

  it('should not trigger for disabled rules', () => {
    const onTrigger = vi.fn();
    engine.addRule({
      id: 'rule1',
      name: 'Test',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 0,
      onTrigger,
      enabled: false,
    });
    engine.evaluate(makeEvent({ id: 'e1', message: 'error' }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('should remove rules', () => {
    engine.addRule({
      id: 'r1',
      name: 'Test',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 0,
      enabled: true,
    });
    engine.removeRule('r1');
    expect(engine.listRules()).toHaveLength(0);
  });

  it('should enable/disable rules', () => {
    const onTrigger = vi.fn();
    engine.addRule({
      id: 'r1',
      name: 'Test',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 0,
      onTrigger,
      enabled: true,
    });
    engine.setEnabled('r1', false);
    engine.evaluate(makeEvent({ id: 'e1', message: 'error' }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('should report stats', () => {
    engine.addRule({
      id: 'r1',
      name: 'Active',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 0,
      enabled: true,
    });
    engine.addRule({
      id: 'r2',
      name: 'Disabled',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 0,
      enabled: false,
    });
    const stats = engine.stats();
    expect(stats.rulesCount).toBe(2);
    expect(stats.activeRules).toBe(1);
  });

  it('should clear state', () => {
    engine.addRule({
      id: 'r1',
      name: 'Test',
      pattern: '.*',
      minSeverity: 'error',
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 0,
      enabled: true,
    });
    engine.clear();
    expect(engine.listRules()).toHaveLength(0);
  });
});
