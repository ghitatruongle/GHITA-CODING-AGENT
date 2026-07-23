// ==============================================================================
// Wave 3 — WsChannel buffering / subscribe / flush
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { WsChannel } from '../src/ws/channel.js';

describe('WsChannel', () => {
  it('subscribes handlers and receives messages', () => {
    const ch = new WsChannel<string>('chat', { qos: 0 });
    const seen: string[] = [];
    const unsub = ch.subscribe((msg) => {
      seen.push(String(msg.payload));
    });
    ch.receive({
      channel: 'chat',
      type: 'msg',
      payload: 'hello',
      id: '1',
      timestamp: Date.now(),
    });
    expect(seen).toEqual(['hello']);
    unsub();
    ch.receive({
      channel: 'chat',
      type: 'msg',
      payload: 'nope',
      id: '2',
      timestamp: Date.now(),
    });
    expect(seen).toEqual(['hello']);
  });

  it('buffers sends until sendFn attached then flushes', () => {
    const ch = new WsChannel<{ n: number }>('ops', { bufferLimit: 5, qos: 0 });
    const sent = ch.send('event', { n: 1 });
    expect(sent.payload).toEqual({ n: 1 });
    expect(ch.bufferedCount).toBe(1);

    const out: unknown[] = [];
    ch.setSendFunction((m) => {
      out.push(m.payload);
    });
    expect(ch.flushBuffer()).toBe(1);
    expect(out).toEqual([{ n: 1 }]);
    expect(ch.bufferedCount).toBe(0);

    ch.send('event', { n: 2 });
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('drops oldest when buffer limit exceeded and closes cleanly', () => {
    const ch = new WsChannel<number>('q', { bufferLimit: 2, qos: 0 });
    ch.send('t', 1);
    ch.send('t', 2);
    ch.send('t', 3);
    expect(ch.bufferedCount).toBe(2);
    expect(ch.subscriberCount).toBe(0);
    ch.close();
    expect(ch.active).toBe(false);
    expect(ch.bufferedCount).toBe(0);
  });

  it('qos>=1 emits ack via sendFn', () => {
    const ch = new WsChannel('ack', { qos: 1 });
    const wire: string[] = [];
    ch.setSendFunction((m) => {
      wire.push(m.type);
    });
    ch.receive({
      channel: 'ack',
      type: 'data',
      payload: true,
      id: 'm1',
      timestamp: Date.now(),
    });
    expect(wire).toContain('__ack');
  });
});
