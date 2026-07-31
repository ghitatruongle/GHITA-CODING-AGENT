// ==============================================================================
// v0.4.9 A6: AIPageController Unit Tests
//
// Uses a fake playwright-like page ($$eval) and a stubbed BrowserController
// adapter to verify observe/act/extract, selector self-heal, and zod-style
// schema validation without a real browser.
// ==============================================================================

import { describe, it, expect, vi } from 'vitest';
import { BrowserController } from './index.js';
import { AIPageController, type SchemaLike } from './stagehand.js';

/** Fake page exposing $$eval like Playwright, returning fixed elements. */
function fakePage(
  elements: Array<{ tag: string; text: string; id?: string; attrs?: Record<string, string> }>,
) {
  return {
    $$eval: async (_sel: string, _fn: (els: Element[]) => unknown) =>
      elements.map((e, idx) => ({
        selector: e.tag + (e.id ? `#${e.id}` : ''),
        text: e.text,
        tag: e.tag,
        attrs: e.attrs ?? {},
        index: idx,
      })),
  };
}

describe('AIPageController.observe', () => {
  it('returns all candidates when no instruction is given', async () => {
    const page = fakePage([
      { tag: 'button', text: 'Login', id: 'login' },
      { tag: 'input', text: '', attrs: { placeholder: 'Email' } },
    ]);
    const sh = new AIPageController(new BrowserController(), page);
    const results = await sh.observe();
    expect(results).toHaveLength(2);
    expect(results.at(0)?.suggestedAction).toBe('click');
    expect(results.at(1)?.suggestedAction).toBe('fill');
    expect(results.at(1)?.description).toBe('Email');
  });

  it('returns the best match with an instruction (keyword fallback)', async () => {
    const page = fakePage([
      { tag: 'button', text: 'Login', id: 'login' },
      { tag: 'button', text: 'Cancel', id: 'cancel' },
    ]);
    const sh = new AIPageController(new BrowserController(), page);
    const results = await sh.observe('login');
    expect(results).toHaveLength(1);
    expect(results.at(0)?.selector).toBe('button#login');
  });
});

describe('AIPageController.act', () => {
  it('clicks the matched element', async () => {
    const click = vi.fn(async () => {});
    const controller = new BrowserController({ click });
    const page = fakePage([{ tag: 'button', text: 'Login', id: 'login' }]);
    const sh = new AIPageController(controller, page);

    const result = await sh.act('click login');
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');
    expect(click).toHaveBeenCalledWith('button#login');
  });

  it('fills an input when the intent implies typing', async () => {
    const fill = vi.fn(async () => {});
    const controller = new BrowserController({ fill });
    const page = fakePage([
      { tag: 'input', text: '', id: 'email', attrs: { placeholder: 'Email' } },
    ]);
    const sh = new AIPageController(controller, page);

    const result = await sh.act('type "hello@x.com" into email', undefined);
    expect(result.success).toBe(true);
    expect(result.action).toBe('fill');
    expect(fill).toHaveBeenCalledWith('input#email', 'hello@x.com');
  });

  it('self-heals: retries after a failing click and reports attempts', async () => {
    let calls = 0;
    const click = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('detached node');
    });
    const controller = new BrowserController({ click });
    const page = fakePage([{ tag: 'button', text: 'Save', id: 'save' }]);
    const sh = new AIPageController(controller, page);

    const result = await sh.act('click save');
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('fails gracefully when no element matches', async () => {
    const controller = new BrowserController({ click: async () => {} });
    const page = fakePage([{ tag: 'button', text: 'Login', id: 'login' }]);
    const sh = new AIPageController(controller, page);
    const result = await sh.act('click the nonexistent widget');
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
  });
});

describe('AIPageController.extract', () => {
  it('returns raw data when no LLM and no schema', async () => {
    const controller = new BrowserController({ extractText: async () => 'Hello world' });
    const sh = new AIPageController(controller, fakePage([]));
    const result = await sh.extract('the greeting');
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ raw: 'Hello world' });
  });

  it('validates against a zod-compatible schema and passes', async () => {
    const controller = new BrowserController({ extractText: async () => 'x' });
    const llm = vi.fn(async () => '{"title":"T","author":"A"}');
    const sh = new AIPageController(controller, fakePage([]), { llm });
    const schema: SchemaLike<{ title: string; author: string }> = {
      safeParse: (data) => {
        const d = data as { title?: unknown; author?: unknown };
        return typeof d.title === 'string' && typeof d.author === 'string'
          ? { success: true, data: { title: d.title, author: d.author } }
          : { success: false, error: 'bad shape' };
      },
    };
    const result = await sh.extract('title and author', schema);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: 'T', author: 'A' });
  });

  it('reports a validation error when the schema rejects the data', async () => {
    const controller = new BrowserController({ extractText: async () => 'x' });
    const llm = vi.fn(async () => '{"title":123}');
    const sh = new AIPageController(controller, fakePage([]), { llm });
    const schema: SchemaLike<{ title: string }> = {
      safeParse: (data) => {
        const d = data as { title?: unknown };
        return typeof d.title === 'string'
          ? { success: true, data: { title: d.title } }
          : { success: false, error: 'title must be a string' };
      },
    };
    const result = await sh.extract('title', schema);
    expect(result.success).toBe(false);
    expect(result.validationError).toBe('title must be a string');
  });
});
