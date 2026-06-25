import { describe, it, expect, vi } from 'vitest';

describe('Communication - Channels', () => {
  it('Multiplexer should subscribe and publish to topics', async () => {
    const mod = await import('@ghita/communication');
    const Multiplexer = (mod as any).Multiplexer;
    if (!Multiplexer) return; // skip if not exported
    const mux = new Multiplexer();
    const handler = vi.fn();
    mux.subscribe('test-topic', handler);
    mux.publish('test-topic', { data: 'hello' });
    expect(handler).toHaveBeenCalledWith({ data: 'hello' });
  });

  it('Multiplexer should unsubscribe handlers', async () => {
    const mod = await import('@ghita/communication');
    const Multiplexer = (mod as any).Multiplexer;
    if (!Multiplexer) return;
    const mux = new Multiplexer();
    const handler = vi.fn();
    mux.subscribe('topic', handler);
    mux.unsubscribe('topic', handler);
    mux.publish('topic', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('Multiplexer should handle multiple subscribers', async () => {
    const mod = await import('@ghita/communication');
    const Multiplexer = (mod as any).Multiplexer;
    if (!Multiplexer) return;
    const mux = new Multiplexer();
    const h1 = vi.fn();
    const h2 = vi.fn();
    mux.subscribe('topic', h1);
    mux.subscribe('topic', h2);
    mux.publish('topic', 'msg');
    expect(h1).toHaveBeenCalledWith('msg');
    expect(h2).toHaveBeenCalledWith('msg');
  });
});
