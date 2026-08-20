import { describe, expect, it } from 'vitest';
import {
  createSummarizationMiddleware,
  createContextEditingMiddleware,
  createToolErrorRecoveryMiddleware,
  createPiiRedactionMiddleware,
} from '../src/middleware/context-middleware.js';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '../src/messages/message.js';
import type { BaseMessage } from '../src/messages/message.js';
import type { MiddlewareContext } from '../src/middleware/types.js';

function makeCtx(messages: BaseMessage[]): MiddlewareContext {
  return {
    agent: {} as never,
    messages,
    metadata: { iteration: 5, maxIterations: 10 },
  };
}

function buildLongConversation(rounds: number): BaseMessage[] {
  const msgs: BaseMessage[] = [
    new SystemMessage('You are a helpful assistant.'),
    new HumanMessage('Help me with code.'),
  ];
  for (let i = 0; i < rounds; i++) {
    msgs.push(new AIMessage(`Let me check file_${i}.ts`));
    msgs.push(new ToolMessage('x'.repeat(500), `tc_${i}`, 'read_file'));
  }
  return msgs;
}

describe('createSummarizationMiddleware', () => {
  it('summarizes old messages when context exceeds threshold', async () => {
    const msgs = buildLongConversation(20);
    const mw = createSummarizationMiddleware({ thresholdChars: 2000, keepRecent: 4 });
    const result = await mw.preModel!(makeCtx(msgs));
    expect(result).toBeDefined();
    expect(result!.messages).toBeDefined();
    // Should have system prompt + summary + 4 recent = 6 messages
    expect(result!.messages!.length).toBeLessThan(msgs.length);
    // Summary message should exist
    const summaryMsg = result!.messages!.find(
      (m) => m instanceof SystemMessage && m.getText().includes('Conversation summary'),
    );
    expect(summaryMsg).toBeDefined();
  });

  it('is a no-op when context is below threshold', async () => {
    const msgs = buildLongConversation(2);
    const mw = createSummarizationMiddleware({ thresholdChars: 50000 });
    const result = await mw.preModel!(makeCtx(msgs));
    expect(result).toBeUndefined();
  });
});

describe('createContextEditingMiddleware', () => {
  it('trims oldest non-system messages to fit budget', async () => {
    const msgs = buildLongConversation(20);
    const mw = createContextEditingMiddleware({ maxChars: 3000 });
    const result = await mw.preModel!(makeCtx(msgs));
    expect(result).toBeDefined();
    // System prompt preserved
    expect((result!.messages![0].toData() as { role?: string }).role).toBe('system');
    // Total chars within budget
    let total = 0;
    for (const m of result!.messages!) total += m.getText().length;
    expect(total).toBeLessThanOrEqual(3000);
  });

  it('is a no-op when already within budget', async () => {
    const msgs = buildLongConversation(2);
    const mw = createContextEditingMiddleware({ maxChars: 100000 });
    const result = await mw.preModel!(makeCtx(msgs));
    expect(result).toBeUndefined();
  });
});

describe('createToolErrorRecoveryMiddleware', () => {
  it('wraps error results with recovery guidance', async () => {
    const mw = createToolErrorRecoveryMiddleware();
    const result = await mw.postTool!(
      'read_file',
      'Error executing tool "read_file": file not found',
      makeCtx([]),
    );
    expect(result).toBeDefined();
    expect(result!.modifiedResult).toContain('[Tool Error]');
    expect(result!.modifiedResult).toContain('adjust your approach');
  });

  it('passes through non-error results unchanged', async () => {
    const mw = createToolErrorRecoveryMiddleware();
    const result = await mw.postTool!('read_file', 'file contents here', makeCtx([]));
    expect(result).toBeUndefined();
  });
});

describe('createPiiRedactionMiddleware', () => {
  it('redacts email addresses in messages', async () => {
    const msgs = [new HumanMessage('Contact me at user@example.com for details')];
    const mw = createPiiRedactionMiddleware();
    const result = await mw.preModel!(makeCtx(msgs));
    expect(result).toBeDefined();
    expect(result!.messages![0].getText()).toContain('[REDACTED:EMAIL]');
    expect(result!.messages![0].getText()).not.toContain('user@example.com');
  });

  it('redacts API keys and tokens', async () => {
    const msgs = [new HumanMessage('My key is sk-abc123def456ghi789jkl012mno345pqr678stu901vwx')];
    const mw = createPiiRedactionMiddleware();
    const result = await mw.preModel!(makeCtx(msgs));
    expect(result).toBeDefined();
    expect(result!.messages![0].getText()).toContain('[REDACTED:API_KEY]');
  });

  it('is a no-op when no PII is present', async () => {
    const msgs = [new HumanMessage('Hello, how are you today?')];
    const mw = createPiiRedactionMiddleware();
    const result = await mw.preModel!(makeCtx(msgs));
    expect(result).toBeUndefined();
  });
});
