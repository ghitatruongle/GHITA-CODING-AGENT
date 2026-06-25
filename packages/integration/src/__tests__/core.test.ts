// ==============================================================================
// @ghita/integration -- Comprehensive Tests
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GhitaCore } from '../core.js';
import { EventBus } from '../event-bus.js';
import { ServiceRegistry } from '../service-registry.js';
import { HealthCheckAggregator } from '../health-check.js';

// ============================================================
// EventBus
// ============================================================

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('registers and emits events', async () => {
    const handler = vi.fn();
    bus.on('test', handler);
    await bus.emit('test', 'data');
    expect(handler).toHaveBeenCalledWith('data');
  });

  it('supports multiple handlers', async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test', h1);
    bus.on('test', h2);
    await bus.emit('test', 42);
    expect(h1).toHaveBeenCalledWith(42);
    expect(h2).toHaveBeenCalledWith(42);
  });

  it('unsubscribes via returned function', async () => {
    const handler = vi.fn();
    const unsub = bus.on('test', handler);
    unsub();
    await bus.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribes via off()', async () => {
    const handler = vi.fn();
    bus.on('test', handler);
    bus.off('test', handler);
    await bus.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('removes all listeners for event', () => {
    bus.on('a', vi.fn());
    bus.on('a', vi.fn());
    bus.on('b', vi.fn());
    bus.removeAllListeners('a');
    expect(bus.listenerCount('a')).toBe(0);
    expect(bus.listenerCount('b')).toBe(1);
  });

  it('removes all listeners when no event specified', () => {
    bus.on('a', vi.fn());
    bus.on('b', vi.fn());
    bus.removeAllListeners();
    expect(bus.listenerCount('a')).toBe(0);
    expect(bus.listenerCount('b')).toBe(0);
  });

  it('returns 0 for unknown event', () => {
    expect(bus.listenerCount('unknown')).toBe(0);
  });

  it('handles async handlers', async () => {
    const results: number[] = [];
    bus.on('test', async (data: number) => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(data);
    });
    await bus.emit('test', 1);
    expect(results).toEqual([1]);
  });
});

// ============================================================
// ServiceRegistry
// ============================================================

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  it('registers and retrieves services', () => {
    registry.register({ name: 'ai-engine', version: '1.0.0' });
    expect(registry.get('ai-engine')).toBeDefined();
    expect(registry.get('ai-engine')?.version).toBe('1.0.0');
  });

  it('unregisters services', () => {
    registry.register({ name: 'test', version: '1.0.0' });
    registry.unregister('test');
    expect(registry.get('test')).toBeUndefined();
  });

  it('returns all services', () => {
    registry.register({ name: 'a', version: '1.0.0' });
    registry.register({ name: 'b', version: '2.0.0' });
    expect(registry.getAll()).toHaveLength(2);
  });

  it('returns healthy for service without health check', async () => {
    registry.register({ name: 'test', version: '1.0.0' });
    const health = await registry.checkHealth('test');
    expect(health.status).toBe('healthy');
  });

  it('runs health check', async () => {
    registry.register({
      name: 'test',
      version: '1.0.0',
      healthCheck: async () => ({ name: 'test', status: 'healthy', latencyMs: 0 }),
    });
    const health = await registry.checkHealth('test');
    expect(health.status).toBe('healthy');
  });

  it('returns unhealthy for unknown service', async () => {
    const health = await registry.checkHealth('unknown');
    expect(health.status).toBe('unhealthy');
  });

  it('returns unhealthy when health check throws', async () => {
    registry.register({
      name: 'test',
      version: '1.0.0',
      healthCheck: async () => { throw new Error('fail'); },
    });
    const health = await registry.checkHealth('test');
    expect(health.status).toBe('unhealthy');
  });

  it('checks all services', async () => {
    registry.register({ name: 'a', version: '1.0.0' });
    registry.register({ name: 'b', version: '1.0.0' });
    const results = await registry.checkAll();
    expect(results).toHaveLength(2);
  });
});

// ============================================================
// HealthCheckAggregator
// ============================================================

describe('HealthCheckAggregator', () => {
  let aggregator: HealthCheckAggregator;

  beforeEach(() => {
    aggregator = new HealthCheckAggregator();
  });

  it('returns healthy when all checks pass', async () => {
    aggregator.register('a', async () => ({ name: 'a', status: 'healthy', latencyMs: 0 }));
    aggregator.register('b', async () => ({ name: 'b', status: 'healthy', latencyMs: 0 }));
    const result = await aggregator.runAll();
    expect(result.overall).toBe('healthy');
  });

  it('returns degraded when some are degraded', async () => {
    aggregator.register('a', async () => ({ name: 'a', status: 'healthy', latencyMs: 0 }));
    aggregator.register('b', async () => ({ name: 'b', status: 'degraded', latencyMs: 0 }));
    const result = await aggregator.runAll();
    expect(result.overall).toBe('degraded');
  });

  it('returns unhealthy when any are unhealthy', async () => {
    aggregator.register('a', async () => ({ name: 'a', status: 'healthy', latencyMs: 0 }));
    aggregator.register('b', async () => ({ name: 'b', status: 'unhealthy', latencyMs: 0 }));
    const result = await aggregator.runAll();
    expect(result.overall).toBe('unhealthy');
  });

  it('handles thrown errors as unhealthy', async () => {
    aggregator.register('a', async () => { throw new Error('fail'); });
    const result = await aggregator.runAll();
    expect(result.overall).toBe('unhealthy');
    expect(result.services[0]?.status).toBe('unhealthy');
  });
});

// ============================================================
// GhitaCore (integration)
// ============================================================

describe('GhitaCore', () => {
  it('creates all subsystems', () => {
    const core = new GhitaCore();
    expect(core.events).toBeInstanceOf(EventBus);
    expect(core.services).toBeInstanceOf(ServiceRegistry);
    expect(core.health).toBeInstanceOf(HealthCheckAggregator);
  });

  it('shuts down cleanly', async () => {
    const core = new GhitaCore();
    core.events.on('test', () => {});
    await core.shutdown();
    expect(core.events.listenerCount('test')).toBe(0);
  });
});
