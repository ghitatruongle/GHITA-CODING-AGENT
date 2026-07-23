// ==============================================================================
// Browser-control fail-closed paths (v0.1.5 P1.2)
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { BrowserController } from '../src/index.js';

describe('BrowserController deny/missing adapter paths', () => {
  it('fails launch when adapter missing', async () => {
    const controller = new BrowserController();
    const result = await controller.launch();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it('fails navigate without adapter and missing url action', async () => {
    const controller = new BrowserController();
    const nav = await controller.navigate('https://example.com');
    expect(nav.success).toBe(false);

    const action = await controller.runAction({ type: 'navigate' } as never);
    expect(action.success).toBe(false);
    expect(action.error).toMatch(/Missing url/i);
  });

  it('uses adapter when provided', async () => {
    const calls: string[] = [];
    const controller = new BrowserController({
      launch: async () => {
        calls.push('launch');
      },
      navigate: async (url) => {
        calls.push(url);
      },
      close: async () => {
        calls.push('close');
      },
    });

    expect((await controller.launch()).success).toBe(true);
    expect((await controller.navigate('https://example.com')).success).toBe(true);
    expect(controller.getState().currentUrl).toBe('https://example.com');
    expect((await controller.close()).success).toBe(true);
    expect(calls).toEqual(['launch', 'https://example.com', 'close']);
  });
});
