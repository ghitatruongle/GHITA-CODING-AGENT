// ==============================================================================
// GHITA CODING AGENT - Clipboard Service Tests
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClipboardService } from './clipboard.js';

describe('ClipboardService', () => {
  let clipboard: ClipboardService;

  beforeEach(() => {
    clipboard = new ClipboardService();
    // Mock navigator.clipboard
    const clipboardMock = {
      readText: vi.fn().mockResolvedValue('test content'),
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: clipboardMock,
      configurable: true,
    });
  });

  it('should read text from browser clipboard', async () => {
    const text = await clipboard.readText();
    expect(text).toBe('test content');
  });

  it('should write text to browser clipboard', async () => {
    const result = await clipboard.writeText('hello');
    expect(result).toBe(true);
  });

  it('should detect content', async () => {
    const has = await clipboard.hasContent();
    expect(has).toBe(true);
  });

  it('should clear the clipboard', async () => {
    await clipboard.clear();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('');
  });
});
