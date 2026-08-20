// ==============================================================================
// v1.1.5-beta1 Track 2.4 — Interjection Buffer Tests
// ==============================================================================

import { describe, expect, it } from 'vitest';
import { InterjectionBuffer } from '../src/interjection/buffer.js';
import { createReActAgent } from '../src/react/agent.js';
import { AIMessage, HumanMessage } from '../src/messages/message.js';

describe('InterjectionBuffer', () => {
  it('enqueues and drains messages atomically', () => {
    const buf = new InterjectionBuffer();
    buf.enqueue('first');
    buf.enqueue('second');
    expect(buf.pendingCount).toBe(2);
    expect(buf.hasPending()).toBe(true);

    const batch = buf.drain();
    expect(batch).toHaveLength(2);
    expect(batch[0].text).toBe('first');
    expect(batch[1].text).toBe('second');
    expect(buf.pendingCount).toBe(0);
    expect(buf.hasPending()).toBe(false);
  });

  it('returns empty array when nothing is queued', () => {
    const buf = new InterjectionBuffer();
    expect(buf.drain()).toEqual([]);
    expect(buf.hasPending()).toBe(false);
  });

  it('drops oldest when exceeding maxPending', () => {
    const buf = new InterjectionBuffer({ maxPending: 3 });
    buf.enqueue('a');
    buf.enqueue('b');
    buf.enqueue('c');
    buf.enqueue('d'); // should drop 'a'
    expect(buf.pendingCount).toBe(3);
    const batch = buf.drain();
    expect(batch.map((m) => m.text)).toEqual(['b', 'c', 'd']);
  });

  it('clear discards all pending messages', () => {
    const buf = new InterjectionBuffer();
    buf.enqueue('x');
    buf.enqueue('y');
    buf.clear();
    expect(buf.pendingCount).toBe(0);
    expect(buf.drain()).toEqual([]);
  });

  it('each message has a unique id and timestamp', () => {
    const buf = new InterjectionBuffer();
    const m1 = buf.enqueue('a');
    const m2 = buf.enqueue('b');
    expect(m1.id).not.toBe(m2.id);
    expect(typeof m1.timestamp).toBe('number');
    expect(m1.timestamp).toBeGreaterThan(0);
  });
});

describe('ReAct agent integration (interjection)', () => {
  it('injects buffered interjections as HumanMessages at iteration boundaries', async () => {
    const buf = new InterjectionBuffer();
    let callCount = 0;
    const llm = async () => {
      callCount++;
      if (callCount === 1) {
        return new AIMessage('working on it', {
          toolCalls: [{ id: 'tc1', name: 'noop', arguments: {} }],
        });
      }
      return new AIMessage('done');
    };

    const agent = createReActAgent({
      config: {
        name: 'inj-test',
        maxIterations: 3,
        tools: [
          { name: 'noop', description: 'does nothing', parameters: {}, execute: async () => 'ok' },
        ],
        interjection: buf,
      },
      llmCall: llm,
    });

    // Enqueue after agent starts but before second iteration
    buf.enqueue('please also check tests');

    const result = await agent.run('fix the bug');
    // The interjection should appear in messages
    const injMsgs = result.messages.filter(
      (m) => m instanceof HumanMessage && m.getText().includes('[user interjection]'),
    );
    expect(injMsgs.length).toBeGreaterThanOrEqual(1);
    expect(injMsgs[0].getText()).toContain('please also check tests');
  });

  it('runs normally when no interjection buffer is configured', async () => {
    const agent = createReActAgent({
      config: { name: 'no-inj', maxIterations: 1 },
      llmCall: async () => new AIMessage('hello'),
    });
    const result = await agent.run('hi');
    expect(result.output).toBe('hello');
  });
});
