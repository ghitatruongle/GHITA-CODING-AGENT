import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

import {
  parseChatStreamEvent,
  appendEventToMessage,
  messageText,
  consumeChatStream,
  layoutDag,
  WorkflowVisualizer,
  type ChatMessage,
  type ChatStreamEvent,
} from './react-ui.js';

const baseAssistant: ChatMessage = {
  id: 'a',
  role: 'assistant',
  parts: [],
  createdAt: 1,
};

describe('parseChatStreamEvent', () => {
  it('parses JSON-lines events', () => {
    expect(parseChatStreamEvent('{"type":"text","delta":"hi"}')).toEqual({
      type: 'text',
      delta: 'hi',
    });
    expect(parseChatStreamEvent('{"type":"done"}')?.type).toBe('done');
    expect(parseChatStreamEvent('not json')).toBeNull();
    expect(parseChatStreamEvent('')).toBeNull();
  });
});

describe('appendEventToMessage', () => {
  it('appends text, tool-call, file and source parts', () => {
    const events: ChatStreamEvent[] = [
      { type: 'text', delta: 'Hello' },
      { type: 'tool-call', name: 'grep_search', args: { pattern: 'x' } },
      { type: 'file', path: 'src/a.ts', name: 'a.ts' },
      { type: 'source', url: 'https://x.dev', title: 'X' },
    ];
    let msg = baseAssistant;
    for (const ev of events) msg = appendEventToMessage(msg, ev);
    expect(msg.parts.map((p) => p.type)).toEqual(['text', 'tool-call', 'file', 'source']);
    expect(messageText(msg)).toBe('Hello');
  });

  it('ignores done/error events', () => {
    const msg = appendEventToMessage(baseAssistant, { type: 'done' });
    expect(msg.parts).toHaveLength(0);
  });
});

describe('consumeChatStream', () => {
  async function* lines(values: string[]) {
    for (const v of values) yield v;
  }

  it('builds an assistant message from a stream', async () => {
    const parts: string[] = [];
    const msg = await consumeChatStream(
      lines([
        '{"type":"text","delta":"A"}',
        '{"type":"tool-call","name":"ls"}',
        '{"type":"text","delta":"B"}',
        '{"type":"done"}',
      ]),
      { onPart: (e) => parts.push(e.type) },
    );
    expect(messageText(msg)).toBe('AB');
    expect(msg.parts[1]?.type).toBe('tool-call');
    expect(parts).toEqual(['text', 'tool-call', 'text', 'done']);
  });

  it('propagates stream errors', async () => {
    await expect(consumeChatStream(lines(['{"type":"error","message":"boom"}']))).rejects.toThrow(
      'boom',
    );
  });
});

describe('layoutDag', () => {
  const steps = [
    { id: 'a', name: 'A', status: 'completed' as const },
    { id: 'b', name: 'B', status: 'running' as const },
    { id: 'c', name: 'C', status: 'pending' as const },
  ];
  const edges = [
    { from: 'a', to: 'c' },
    { from: 'b', to: 'c' },
  ];

  it('lays out layers by longest path', () => {
    const layout = layoutDag(steps, edges);
    expect(layout.layers).toBe(2);
    const a = must(layout.nodes.find((n) => n.node.id === 'a'));
    const c = must(layout.nodes.find((n) => n.node.id === 'c'));
    expect(a.layer).toBe(0);
    expect(c.layer).toBe(1);
    expect(c.x).toBeGreaterThan(a.x);
  });

  it('handles empty and cyclic inputs', () => {
    expect(layoutDag([]).layers).toBe(0);
    const cycle = layoutDag(steps, [{ from: 'c', to: 'a' }]);
    expect(cycle.nodes).toHaveLength(3);
  });
});

describe('WorkflowVisualizer', () => {
  it('renders positioned nodes with status (SSR smoke)', () => {
    const el = createElement(WorkflowVisualizer, {
      steps: [
        { id: 'a', name: 'Lint', status: 'completed' },
        { id: 'b', name: 'Test', status: 'running' },
      ],
      edges: [{ from: 'a', to: 'b' }],
      currentStepId: 'b',
    });
    const html = renderToString(el);
    expect(html).toContain('data-workflow-node="a"');
    expect(html).toContain('data-status="running"');
    expect(html).toContain('data-current="true"');
    expect(html).toContain('Lint');
  });
});
