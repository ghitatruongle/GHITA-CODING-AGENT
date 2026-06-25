// ==============================================================================
// GHITA CODING AGENT - EventStream Unit Tests (Phase 7)
// 35 test cases covering subscribe/unsubscribe, emit, replay, ring buffer,
// WebSocket bridge, plugin hook, stats, error handling, dict conversion.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventStream, event_to_dict, dict_to_event } from '../src/stream/event-stream.js';
import type { StreamEvent, RewindWriter } from '../src/stream/types.js';

describe('EventStream', () => {
  let stream: EventStream;

  beforeEach(() => {
    stream = new EventStream({ bufferSize: 50, swallowErrors: true });
  });

  // ── Group 1: Subscribe / unsubscribe (6 tests) ─────────────────────────

  describe('subscribe', () => {
    it('1. subscribe increases subscriberCount', () => {
      const unsub = stream.subscribe(() => {});
      expect(stream.subscriberCount).toBe(1);
      unsub();
    });

    it('2. unsubscribe decreases subscriberCount', () => {
      const unsub = stream.subscribe(() => {});
      unsub();
      expect(stream.subscriberCount).toBe(0);
    });

    it('3. subscriber receives replay of buffered events', async () => {
      await stream.emit('message.start', 'orchestrator', { text: 'hi' });
      await stream.emit('message.delta', 'orchestrator', { delta: 'world' });

      const received: StreamEvent[] = [];
      stream.subscribe(
        (evt) => {
          received.push(evt);
        },
        { replay: true },
      );
      expect(received).toHaveLength(2);
    });

    it('4. subscriber skips replay when replay=false', async () => {
      await stream.emit('message.start', 'orchestrator');
      const received: StreamEvent[] = [];
      stream.subscribe(
        (evt) => {
          received.push(evt);
        },
        { replay: false },
      );
      expect(received).toHaveLength(0);
    });

    it('5. throws when subscriber limit reached', () => {
      const small = new EventStream({ maxSubscribers: 2 });
      small.subscribe(() => {});
      small.subscribe(() => {});
      expect(() => small.subscribe(() => {})).toThrow(/subscriber limit/);
    });

    it('6. multiple subscribers all receive events', async () => {
      const r1: StreamEvent[] = [];
      const r2: StreamEvent[] = [];
      stream.subscribe((e) => {
        r1.push(e);
      });
      stream.subscribe((e) => {
        r2.push(e);
      });
      await stream.emit('tool.call', 'tool', { name: 'read' });
      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);
    });
  });

  // ── Group 2: Emit (5 tests) ────────────────────────────────────────────

  describe('emit', () => {
    it('7. emit returns event with id and timestamp', async () => {
      const evt = await stream.emit('message.start', 'orchestrator', { text: 'go' });
      expect(evt.id).toBe(1);
      expect(evt.type).toBe('message.start');
      expect(evt.source).toBe('orchestrator');
      expect(evt.timestamp).toBeGreaterThan(0);
      expect(evt.data).toEqual({ text: 'go' });
    });

    it('8. event ids are monotonically increasing', async () => {
      const e1 = await stream.emit('message.start', 'orchestrator');
      const e2 = await stream.emit('message.delta', 'orchestrator');
      expect(e2.id).toBeGreaterThan(e1.id);
    });

    it('9. seq numbers are monotonically increasing', async () => {
      const e1 = await stream.emit('message.start', 'orchestrator');
      const e2 = await stream.emit('message.complete', 'orchestrator');
      expect(e2.seq).toBeGreaterThan(e1.seq!);
    });

    it('10. emit pushes to buffer', async () => {
      await stream.emit('message.start', 'orchestrator');
      expect(stream.snapshot()).toHaveLength(1);
    });

    it('11. emit delivers to all subscribers', async () => {
      const received: StreamEvent[] = [];
      stream.subscribe((e) => {
        received.push(e);
      });
      await stream.emit('tool.result', 'tool', { output: 'ok' });
      expect(received).toHaveLength(1);
      expect(received[0]!.data).toEqual({ output: 'ok' });
    });
  });

  // ── Group 3: Ring buffer (4 tests) ─────────────────────────────────────

  describe('ring buffer', () => {
    it('12. buffer respects capacity', async () => {
      const small = new EventStream({ bufferSize: 3 });
      for (let i = 0; i < 10; i++) {
        await small.emit('message.delta', 'orchestrator', { i });
      }
      expect(small.snapshot()).toHaveLength(3);
    });

    it('13. oldest events are dropped first', async () => {
      const small = new EventStream({ bufferSize: 3 });
      for (let i = 0; i < 5; i++) {
        await small.emit('message.delta', 'orchestrator', { i });
      }
      const snap = small.snapshot();
      expect(snap[0]!.data).toEqual({ i: 2 });
    });

    it('14. clearBuffer empties the buffer', async () => {
      await stream.emit('message.start', 'orchestrator');
      stream.clearBuffer();
      expect(stream.snapshot()).toHaveLength(0);
    });

    it('15. snapshot returns copy (mutation safe)', async () => {
      await stream.emit('message.start', 'orchestrator');
      const snap1 = stream.snapshot();
      snap1.pop();
      expect(stream.snapshot()).toHaveLength(1);
    });
  });

  // ── Group 4: Replay with filters (6 tests) ────────────────────────────

  describe('replay', () => {
    beforeEach(async () => {
      await stream.emit('message.start', 'orchestrator', {}, { sessionId: 's1' });
      await stream.emit('tool.call', 'tool', { name: 'read' }, { toolName: 'read' });
      await stream.emit('tool.result', 'tool', { output: 'data' }, { toolName: 'read' });
      await stream.emit('message.complete', 'orchestrator', {}, { sessionId: 's1' });
    });

    it('16. replay with no filter returns all', () => {
      const results = stream.replay();
      expect(results).toHaveLength(4);
    });

    it('17. replay filter by type', () => {
      const results = stream.replay({ type: 'tool.call' });
      expect(results).toHaveLength(1);
    });

    it('18. replay filter by type array', () => {
      const results = stream.replay({ type: ['tool.call', 'tool.result'] });
      expect(results).toHaveLength(2);
    });

    it('19. replay filter by source', () => {
      const results = stream.replay({ source: 'tool' });
      expect(results).toHaveLength(2);
    });

    it('20. replay filter by toolName', () => {
      const results = stream.replay({ toolName: 'read' });
      expect(results).toHaveLength(2);
    });

    it('21. replay filter by limit', () => {
      const results = stream.replay({ limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  // ── Group 5: RewindWriter integration (2 tests) ────────────────────────

  describe('rewindWriter', () => {
    it('22. events are persisted to rewindWriter', async () => {
      const persisted: StreamEvent[] = [];
      const writer: RewindWriter = {
        append: (evt) => {
          persisted.push(evt);
        },
        rewind: async () => [],
        size: () => persisted.length,
      };
      const s = new EventStream({ rewindWriter: writer });
      await s.emit('message.start', 'orchestrator');
      await s.emit('message.delta', 'orchestrator');
      expect(persisted).toHaveLength(2);
    });

    it('23. writer errors are swallowed when swallowErrors=true', async () => {
      const writer: RewindWriter = {
        append: () => {
          throw new Error('disk full');
        },
        rewind: async () => [],
        size: () => 0,
      };
      const s = new EventStream({ rewindWriter: writer, swallowErrors: true });
      await s.emit('message.start', 'orchestrator');
      expect(s.getStats().totalErrors).toBe(1);
    });
  });

  // ── Group 6: WebSocket bridge (2 tests) ────────────────────────────────

  describe('WebSocket bridge', () => {
    it('24. bridge sends JSON to sender', async () => {
      const sent: string[] = [];
      const unsub = stream.attachWebSocketBridge((json) => {
        sent.push(json);
      });
      await stream.emit('message.start', 'orchestrator', { hello: 'world' });
      expect(sent).toHaveLength(1);
      const parsed = JSON.parse(sent[0]!);
      expect(parsed.type).toBe('message.start');
      expect(parsed.data.hello).toBe('world');
      unsub();
    });

    it('25. bridge unsubscribe stops sending', async () => {
      const sent: string[] = [];
      const unsub = stream.attachWebSocketBridge((json) => {
        sent.push(json);
      });
      await stream.emit('message.start', 'orchestrator');
      unsub();
      await stream.emit('message.delta', 'orchestrator');
      expect(sent).toHaveLength(1);
    });
  });

  // ── Group 7: Plugin hook runner (2 tests) ──────────────────────────────

  describe('plugin hook runner', () => {
    it('26. plugin hook receives events', async () => {
      const received: StreamEvent[] = [];
      stream.setPluginHookRunner((evt) => {
        received.push(evt);
      });
      await stream.emit('message.start', 'orchestrator');
      expect(received).toHaveLength(1);
    });

    it('27. unregister plugin hook with null', async () => {
      const received: StreamEvent[] = [];
      stream.setPluginHookRunner((evt) => {
        received.push(evt);
      });
      await stream.emit('message.start', 'orchestrator');
      stream.setPluginHookRunner(null);
      await stream.emit('message.delta', 'orchestrator');
      expect(received).toHaveLength(1);
    });
  });

  // ── Group 8: Stats (3 tests) ───────────────────────────────────────────

  describe('stats', () => {
    it('28. getStats tracks emitted and delivered', async () => {
      stream.subscribe(() => {});
      await stream.emit('message.start', 'orchestrator');
      const s = stream.getStats();
      expect(s.totalEmitted).toBe(1);
      expect(s.totalDelivered).toBe(1);
    });

    it('29. resetStats zeros counters', async () => {
      await stream.emit('message.start', 'orchestrator');
      stream.resetStats();
      expect(stream.getStats().totalEmitted).toBe(0);
    });

    it('30. bufferSize in stats', async () => {
      await stream.emit('message.start', 'orchestrator');
      await stream.emit('message.delta', 'orchestrator');
      expect(stream.getStats().bufferSize).toBe(2);
    });
  });

  // ── Group 9: Error handling (2 tests) ──────────────────────────────────

  describe('error handling', () => {
    it('31. subscriber error is swallowed gracefully', async () => {
      stream.subscribe(() => {
        throw new Error('boom');
      });
      await stream.emit('message.start', 'orchestrator');
      expect(stream.getStats().totalErrors).toBe(1);
    });

    it('32. subscriber async rejection is tracked', async () => {
      stream.subscribe(async () => {
        throw new Error('async boom');
      });
      await stream.emit('message.start', 'orchestrator');
      // Give async error time to be caught
      await new Promise((r) => setTimeout(r, 10));
      expect(stream.getStats().totalErrors).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Group 10: event_to_dict / dict_to_event (3 tests) ──────────────────

  describe('event_to_dict / dict_to_event', () => {
    it('33. event_to_dict serializes correctly', async () => {
      const evt = await stream.emit('tool.call', 'tool', { name: 'bash' });
      const dict = event_to_dict(evt);
      expect(dict.type).toBe('tool.call');
      expect(dict.source).toBe('tool');
      expect((dict.data as any).name).toBe('bash');
    });

    it('34. dict_to_event reconstructs event', () => {
      const dict = {
        id: 42,
        type: 'message.start',
        source: 'orchestrator',
        timestamp: 1000,
        data: { x: 1 },
      };
      const evt = dict_to_event(dict);
      expect(evt.id).toBe(42);
      expect(evt.type).toBe('message.start');
      expect(evt.data).toEqual({ x: 1 });
    });

    it('35. dict_to_event throws on invalid input', () => {
      expect(() => dict_to_event(null)).toThrow();
      expect(() => dict_to_event('string')).toThrow();
      expect(() => dict_to_event({ type: 'x' })).toThrow(/missing type or source/);
    });
  });
});
