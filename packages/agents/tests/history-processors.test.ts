import { describe, expect, it } from 'vitest';
import {
  lastNObservations,
  tagToolCalls,
  cacheControl,
  truncateByTokens,
  applyHistoryProcessors,
} from '../src/middleware/history-processors.js';
import { createHistoryProcessorMiddleware } from '../src/middleware/history-processor-middleware.js';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '../src/messages/message.js';
import type { BaseMessage } from '../src/messages/message.js';
import type { ProcessorContext } from '../src/middleware/history-processors.js';

const ctx: ProcessorContext = { iteration: 5, maxIterations: 10 };

/** Build a realistic long conversation: system + human + N tool round-trips. */
function buildLongConversation(toolRounds: number): BaseMessage[] {
  const msgs: BaseMessage[] = [
    new SystemMessage('You are a helpful coding assistant.'),
    new HumanMessage('Fix the bug in auth module.'),
  ];
  for (let i = 0; i < toolRounds; i++) {
    // Each round: AI calls a tool → tool returns ~500 chars of output.
    msgs.push(
      new AIMessage(`Let me check file_${i}.ts`, {
        toolCalls: [{ id: `tc_${i}`, name: 'read_file', arguments: { path: `file_${i}.ts` } }],
      }),
    );
    const observation = `File file_${i}.ts contents:\n${'x'.repeat(480)}\nLine ${i}: found issue.`;
    msgs.push(new ToolMessage(observation, `tc_${i}`, 'read_file'));
  }
  return msgs;
}

function totalChars(msgs: BaseMessage[]): number {
  return msgs.reduce((sum, m) => sum + m.getText().length, 0);
}

describe('lastNObservations', () => {
  it('keeps only the N most recent tool observations, elides older ones', () => {
    const msgs = buildLongConversation(10);
    const processed = lastNObservations(3)(msgs, ctx);

    // Same message count (elided messages are replaced, not removed).
    expect(processed.length).toBe(msgs.length);

    // The last 3 ToolMessages should retain their original content.
    const toolMsgs = processed.filter((m) => m instanceof ToolMessage);
    expect(toolMsgs.length).toBe(10);
    for (let i = 7; i < 10; i++) {
      expect(toolMsgs[i].getText()).toContain(`File file_${i}.ts contents:`);
    }
    // Older ones should be elided.
    for (let i = 0; i < 7; i++) {
      expect(toolMsgs[i].getText()).toContain('[elided observation');
    }
  });

  it('does not touch non-tool messages', () => {
    const msgs = buildLongConversation(5);
    const processed = lastNObservations(1)(msgs, ctx);
    expect(processed[0].getText()).toBe(msgs[0].getText()); // SystemMessage
    expect(processed[1].getText()).toBe(msgs[1].getText()); // HumanMessage
  });

  it('is a no-op when n >= number of tool messages', () => {
    const msgs = buildLongConversation(3);
    const processed = lastNObservations(10)(msgs, ctx);
    for (let i = 0; i < msgs.length; i++) {
      expect(processed[i].getText()).toBe(msgs[i].getText());
    }
  });
});

describe('tagToolCalls', () => {
  it('annotates every ToolMessage with tag metadata equal to its tool name', () => {
    const msgs = buildLongConversation(3);
    const processed = tagToolCalls()(msgs, ctx);
    const toolMsgs = processed.filter((m) => m instanceof ToolMessage);
    for (const tm of toolMsgs) {
      const data = tm.toData() as { metadata?: Record<string, unknown> };
      expect(data.metadata?.tag).toBe(tm.toolName);
    }
  });

  it('preserves existing metadata alongside the new tag', () => {
    const msg = new ToolMessage('output', 'tc_0', 'grep', { metadata: { existing: true } });
    const processed = tagToolCalls()([msg], ctx);
    const data = processed[0].toData() as { metadata?: Record<string, unknown> };
    expect(data.metadata?.tag).toBe('grep');
    expect(data.metadata?.existing).toBe(true);
  });
});

describe('cacheControl', () => {
  it('marks the trailing N messages with cache_control ephemeral', () => {
    const msgs = buildLongConversation(5);
    const processed = cacheControl(4)(msgs, ctx);
    const tail = processed.slice(-4);
    for (const m of tail) {
      const data = m.toData() as { metadata?: Record<string, unknown> };
      expect(data.metadata?.cache_control).toBe('ephemeral');
    }
    // Messages outside the window should NOT have the flag.
    const head = processed.slice(0, -4);
    for (const m of head) {
      const data = m.toData() as { metadata?: Record<string, unknown> };
      expect(data.metadata?.cache_control).toBeUndefined();
    }
  });
});

describe('truncateByTokens', () => {
  it('drops oldest non-system messages to fit within budget', () => {
    const msgs = buildLongConversation(10);
    const before = totalChars(msgs);
    const budget = Math.floor(before * 0.4); // target 60% reduction
    const processed = truncateByTokens(budget)(msgs, ctx);
    const after = totalChars(processed);

    expect(after).toBeLessThanOrEqual(budget);
    // System message is always preserved.
    expect(processed[0].getText()).toBe(msgs[0].getText());
  });

  it('is a no-op when already within budget', () => {
    const msgs = buildLongConversation(2);
    const processed = truncateByTokens(100_000)(msgs, ctx);
    expect(processed.length).toBe(msgs.length);
  });
});

describe('applyHistoryProcessors (pipeline composition)', () => {
  it('applies processors in order and achieves ≥40% char reduction on long conversations', () => {
    const msgs = buildLongConversation(20); // 20 tool rounds ≈ 10k+ chars
    const before = totalChars(msgs);

    const processors = [
      lastNObservations(5), // keep only 5 most recent observations
      truncateByTokens(Math.floor(before * 0.5)), // hard cap at 50%
    ];
    const processed = applyHistoryProcessors(msgs, processors, ctx);
    const after = totalChars(processed);

    const reduction = (before - after) / before;
    expect(reduction).toBeGreaterThanOrEqual(0.4);
    // Sanity: system prompt and user message survive.
    expect(processed[0].getText()).toBe(msgs[0].getText());
    expect(processed[1].getText()).toBe(msgs[1].getText());
  });

  it('returns the original list when given zero processors', () => {
    const msgs = buildLongConversation(3);
    const processed = applyHistoryProcessors(msgs, [], ctx);
    expect(processed).toBe(msgs);
  });
});

describe('createHistoryProcessorMiddleware (ReAct integration)', () => {
  it('transforms messages via preModel hook', async () => {
    const msgs = buildLongConversation(10);
    const mw = createHistoryProcessorMiddleware({
      processors: [lastNObservations(2)],
    });

    const result = await mw.preModel!({
      agent: {} as never,
      messages: msgs,
      metadata: { iteration: 5, maxIterations: 10 },
    });

    expect(result).toBeDefined();
    expect(result!.messages).toBeDefined();
    // Only the last 2 tool observations should be intact.
    const toolMsgs = result!.messages!.filter((m) => m instanceof ToolMessage);
    const elided = toolMsgs.filter((m) => m.getText().includes('[elided'));
    expect(elided.length).toBe(8); // 10 - 2 = 8 elided
  });

  it('returns undefined (no-op) when processor list is empty', async () => {
    const mw = createHistoryProcessorMiddleware({ processors: [] });
    const result = await mw.preModel!({
      agent: {} as never,
      messages: buildLongConversation(3),
      metadata: { iteration: 0, maxIterations: 10 },
    });
    expect(result).toBeUndefined();
  });
});
