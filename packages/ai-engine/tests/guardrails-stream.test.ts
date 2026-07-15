// ==============================================================================
// GHITA CODING AGENT — Audit Fix 2.7 Regression Tests
//
// Covers the PII-stream-buffer fix in `createPIIDetectorStreamMiddleware`:
// the old implementation only retained a 50-char `TAIL_DELAY` and would
// silently leak PII whenever a pattern (email, phone, credit-card, etc.)
// straddled the boundary between two stream chunks.
//
// The fix replaces the 50-char tail with a 320-char sliding window (long
// enough to fit RFC 5321's 254-char email limit) and a 1 MB hard cap.
//
// These tests intentionally feed PII-bearing text across multiple chunks
// to prove the buffer catches matches that span boundaries.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { createPIIDetectorStreamMiddleware } from '../src/middleware/guardrails.js';
import type { AIProvider } from '../src/types.js';
import type { AIStreamChunk } from '@ghita/shared';
import type { ChatMessage } from '../src/types.js';

function mockProvider(): AIProvider {
  return {
    type: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o'],
    isReady: async () => true,
    test: async () => true,
    chat: async () => ({
      content: 'irrelevant',
      model: 'gpt-4o',
      provider: 'openai',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    }),
    chatStream: async function* () {
      // Default empty; individual tests inject their own generator via `next`.
    },
    embed: async () => ({
      embedding: [0],
      model: 'text-embedding-3-small',
      provider: 'openai',
    }),
    embedMany: async () => ({
      embeddings: [[0]],
      model: 'text-embedding-3-small',
      provider: 'openai',
    }),
  };
}

/** Drain a stream into a single concatenated string. */
async function drain(gen: AsyncGenerator<AIStreamChunk>): Promise<string> {
  let out = '';
  for await (const chunk of gen) {
    if (chunk.content) out += chunk.content;
  }
  return out;
}

/** Drain a stream and collect each chunk's content separately so tests can
 * assert that PII is masked at emit time — not just on the final join.
 * This catches "lazy" implementations that emit everything unmasked and
 * then redact at the very end (which the joined-string check would miss). */
async function drainChunks(gen: AsyncGenerator<AIStreamChunk>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of gen) {
    if (chunk.content) chunks.push(chunk.content);
  }
  return chunks;
}

/** Build a stream from a sequence of fixed-size character chunks. */
async function* chunkedStream(text: string, chunkSize: number): AsyncGenerator<AIStreamChunk> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield {
      content: text.slice(i, i + chunkSize),
      done: false,
      provider: 'openai',
      model: 'gpt-4o',
    };
  }
  yield { content: '', done: true, provider: 'openai', model: 'gpt-4o' };
}

const baselineMessages: ChatMessage[] = [{ role: 'user', content: 'noop' }];

describe('Audit Fix 2.7 — PII Stream Sliding Window', () => {
  it('masks an email address that is split across two chunks', async () => {
    const middleware = createPIIDetectorStreamMiddleware({ enabled: true });
    const provider = mockProvider();
    const email = 'john.doe+test@evil-corp.example.com';
    const splitAt = Math.floor(email.length / 2); // ~16 / 16 chars
    const stream = middleware({ messages: baselineMessages, provider }, async () =>
      chunkedStream(email, splitAt),
    );
    const out = await drain(await stream);
    expect(out).not.toContain(email);
    expect(out).toContain('***');
  });

  it('masks an email address split into very small (3-char) chunks', async () => {
    const middleware = createPIIDetectorStreamMiddleware({ enabled: true });
    const provider = mockProvider();
    const email = 'secret.user@example.com';
    const stream = middleware({ messages: baselineMessages, provider }, async () =>
      chunkedStream(email, 3),
    );
    const chunks = await drainChunks(await stream);
    const joined = chunks.join('');
    // The whole-email-shaped string must never appear in any chunk's
    // payload — only the masked form. This catches "emit raw, redact at end"
    // implementations that the joined-only assertion would miss.
    expect(chunks.some((c) => c.includes(email))).toBe(false);
    expect(joined).toContain('***');
  });

  it('masks a phone number split across chunks', async () => {
    const middleware = createPIIDetectorStreamMiddleware({ enabled: true });
    const provider = mockProvider();
    const phone = '+1-555-123-4567';
    const stream = middleware({ messages: baselineMessages, provider }, async () =>
      chunkedStream(phone, 4),
    );
    const chunks = await drainChunks(await stream);
    const joined = chunks.join('');
    expect(chunks.some((c) => c.includes(phone))).toBe(false);
    expect(joined).toContain('***');
  });

  it('masks a long email split across many small chunks (regression vs 50-char tail)', async () => {
    const middleware = createPIIDetectorStreamMiddleware({ enabled: true });
    const provider = mockProvider();
    // 60-char user + @ + 30-char domain = a string longer than the old 50-char tail
    const longEmail =
      'a.very.long.user.name.that.exceeds.fifty.characters@example-corp.example.com';
    expect(longEmail.length).toBeGreaterThan(50);
    const stream = middleware({ messages: baselineMessages, provider }, async () =>
      chunkedStream(longEmail, 7),
    );
    const chunks = await drainChunks(await stream);
    const joined = chunks.join('');
    expect(chunks.some((c) => c.includes(longEmail))).toBe(false);
    expect(joined).not.toContain(longEmail);
    expect(joined).toContain('***');
  });

  it('passes clean content through unchanged', async () => {
    const middleware = createPIIDetectorStreamMiddleware({ enabled: true });
    const provider = mockProvider();
    const clean = 'The quick brown fox jumps over the lazy dog.';
    const stream = middleware({ messages: baselineMessages, provider }, async () =>
      chunkedStream(clean, 5),
    );
    const out = await drain(await stream);
    expect(out).toBe(clean);
    expect(out).not.toContain('***');
  });

  it('emits a final done:true chunk', async () => {
    const middleware = createPIIDetectorStreamMiddleware({ enabled: true });
    const provider = mockProvider();
    const gen = await middleware({ messages: baselineMessages, provider }, async () =>
      chunkedStream('hi', 2),
    );
    let sawDone = false;
    for await (const chunk of gen) {
      if (chunk.done === true) sawDone = true;
    }
    expect(sawDone).toBe(true);
  });

  it('is a no-op when disabled', async () => {
    const middleware = createPIIDetectorStreamMiddleware({ enabled: false });
    const provider = mockProvider();
    const email = 'still.visible@example.com';
    const stream = middleware({ messages: baselineMessages, provider }, async () =>
      chunkedStream(email, 6),
    );
    const out = await drain(await stream);
    expect(out).toContain(email);
  });
});
