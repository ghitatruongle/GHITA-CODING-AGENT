import { describe, it, expect, vi } from 'vitest';
import {
  collectCandidates,
  resolveSelectorByIntent,
  aiClick,
  aiExtract,
  type AIBrowserContext,
} from './ai-browser.js';
import { BrowserController } from './index.js';

describe('collectCandidates', () => {
  it('should return empty array for null page', async () => {
    const result = await collectCandidates(null, 30);
    expect(result).toEqual([]);
  });

  it('should return empty array for page without $$eval', async () => {
    const result = await collectCandidates({}, 30);
    expect(result).toEqual([]);
  });

  it('should collect candidates from page', async () => {
    const mockElements = [
      {
        tagName: 'button',
        id: '',
        className: 'btn-primary',
        textContent: ' Click Me ',
        getAttribute: (_a: string) => null,
      },
      {
        tagName: 'a',
        id: 'link1',
        className: '',
        textContent: ' Go Here ',
        getAttribute: (_a: string) => (_a === 'href' ? '/page' : null),
      },
    ];
    const page = {
      $$eval: vi.fn().mockImplementation((_sel: string, fn: (els: Element[]) => unknown) => {
        return fn(mockElements as unknown as Element[]);
      }),
    };
    const candidates = await collectCandidates(page, 30);
    expect(candidates.length).toBe(2);
    expect(candidates[0]?.tag).toBe('button');
    expect(candidates[1]?.tag).toBe('a');
  });

  it('should respect max limit', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      tagName: 'input',
      id: '',
      className: '',
      textContent: `Item ${i}`,
      getAttribute: (_a: string) => null,
    }));
    const page = {
      $$eval: vi.fn().mockImplementation((_sel: string, fn: (els: Element[]) => unknown) => {
        return fn(items as unknown as Element[]);
      }),
    };
    const candidates = await collectCandidates(page, 10);
    expect(candidates.length).toBe(10);
  });
});

describe('resolveSelectorByIntent', () => {
  const makeCandidate = (
    overrides: Partial<{
      text: string;
      tag: string;
      selector: string;
      attrs: Record<string, string>;
    }> = {},
  ) => ({
    selector: '#btn',
    text: 'Submit',
    tag: 'button',
    attrs: {},
    ...overrides,
  });

  it('should return null for empty candidates', async () => {
    const result = await resolveSelectorByIntent('click', []);
    expect(result).toBeNull();
  });

  describe('keyword fallback (no LLM)', () => {
    it('should find by text match', async () => {
      const candidates = [
        makeCandidate({ text: 'Submit Form', selector: '#submit' }),
        makeCandidate({ text: 'Cancel', selector: '#cancel' }),
      ];
      const result = await resolveSelectorByIntent('submit', candidates);
      expect(result?.selector).toBe('#submit');
    });

    it('should find by attribute match', async () => {
      const candidates = [
        makeCandidate({ text: 'Hello', attrs: { name: 'search' } }),
        makeCandidate({ text: 'World', attrs: { name: 'email' } }),
      ];
      const result = await resolveSelectorByIntent('search', candidates);
      expect(result?.selector).toBe('#btn'); // first candidate matches
    });

    it('should return first candidate when multiple match text', async () => {
      const candidates = [
        makeCandidate({ text: 'Save Changes', selector: '#save' }),
        makeCandidate({ text: 'Save', selector: '#save-2' }),
      ];
      const result = await resolveSelectorByIntent('save', candidates);
      expect(result?.selector).toBe('#save');
    });

    it('should return null when no match found', async () => {
      const candidates = [makeCandidate({ text: 'Hello' }), makeCandidate({ text: 'World' })];
      const result = await resolveSelectorByIntent('nonexistent', candidates);
      expect(result).toBeNull();
    });
  });

  describe('LLM resolution', () => {
    it('should use LLM to select element', async () => {
      const llm = vi.fn().mockResolvedValue('{"index": 1}');
      const candidates = [
        makeCandidate({ text: 'Delete', selector: '#delete' }),
        makeCandidate({ text: 'Confirm Delete', selector: '#confirm' }),
      ];
      const ctx: AIBrowserContext = { llm };
      const result = await resolveSelectorByIntent('delete', candidates, ctx);
      expect(result?.selector).toBe('#confirm');
      expect(llm).toHaveBeenCalled();
    });

    it('should return null when LLM returns -1', async () => {
      const llm = vi.fn().mockResolvedValue('{"index": -1}');
      const candidates = [makeCandidate({ text: 'Hello' })];
      const result = await resolveSelectorByIntent('test', candidates, { llm });
      expect(result).toBeNull();
    });

    it('should return null when LLM response is invalid JSON', async () => {
      const llm = vi.fn().mockResolvedValue('not json');
      const candidates = [makeCandidate({ text: 'Hello' })];
      const result = await resolveSelectorByIntent('test', candidates, { llm });
      expect(result).toBeNull();
    });

    it('should handle LLM timeout', async () => {
      const llm = vi
        .fn()
        .mockImplementation(() => new Promise<string>((resolve) => setTimeout(resolve, 5000)));
      const candidates = [makeCandidate({ text: 'Hello' })];
      const result = await resolveSelectorByIntent('test', candidates, { llm, timeoutMs: 10 });
      expect(result).toBeNull();
    });

    it('should handle LLM throwing', async () => {
      const llm = vi.fn().mockRejectedValue(new Error('API error'));
      const candidates = [makeCandidate({ text: 'Hello' })];
      const result = await resolveSelectorByIntent('test', candidates, { llm });
      expect(result).toBeNull();
    });
  });
});

describe('aiClick', () => {
  it('should fail when no interactive elements found', async () => {
    const controller = new BrowserController();
    const result = await aiClick(controller, 'click submit', null);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No interactive elements');
  });

  it('should fail when intent does not match any element', async () => {
    const controller = new BrowserController();
    const page = {
      $$eval: vi.fn().mockImplementation((_sel: string, fn: (els: Element[]) => unknown) => {
        return fn([] as unknown as Element[]);
      }),
    };
    const result = await aiClick(controller, 'click submit', page);
    expect(result.success).toBe(false);
  });

  it('should click element matching intent', async () => {
    const adapter = { click: vi.fn().mockResolvedValue(undefined) };
    const controller = new BrowserController(adapter);
    const mockElements = [
      {
        tagName: 'button',
        id: '',
        className: '',
        textContent: ' Submit ',
        getAttribute: (_a: string) => null,
      },
    ];
    const page = {
      $$eval: vi.fn().mockImplementation((_sel: string, fn: (els: Element[]) => unknown) => {
        return fn(mockElements as unknown as Element[]);
      }),
    };
    const result = await aiClick(controller, 'submit', page);
    expect(result.success).toBe(true);
    expect(adapter.click).toHaveBeenCalled();
  });
});

describe('aiExtract', () => {
  it('should fail when page extraction fails', async () => {
    const controller = new BrowserController();
    const result = await aiExtract(controller, '{title: string}', {});
    expect(result.success).toBe(false);
  });

  it('should return raw text when no LLM is available', async () => {
    const adapter = { extractText: vi.fn().mockResolvedValue('Hello World') };
    const controller = new BrowserController(adapter);
    const result = await aiExtract(controller, '{title: string}', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ raw: 'Hello World' });
  });

  it('should use LLM to extract structured data', async () => {
    const adapter = { extractText: vi.fn().mockResolvedValue('Page content here') };
    const controller = new BrowserController(adapter);
    const llm = vi.fn().mockResolvedValue('{"title": "Test Page"}');
    const result = await aiExtract(controller, '{title: string}', {}, { llm });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: 'Test Page' });
  });

  it('should handle LLM JSON parse errors', async () => {
    const adapter = { extractText: vi.fn().mockResolvedValue('Some text') };
    const controller = new BrowserController(adapter);
    const llm = vi.fn().mockResolvedValue('not json at all');
    const result = await aiExtract(controller, '{title: string}', {}, { llm });
    expect(result.success).toBe(false);
  });

  it('should handle LLM timeout', async () => {
    const adapter = { extractText: vi.fn().mockResolvedValue('Some text') };
    const controller = new BrowserController(adapter);
    const llm = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));
    const result = await aiExtract(controller, '{title: string}', {}, { llm, timeoutMs: 10 });
    expect(result.success).toBe(false);
  });
});
