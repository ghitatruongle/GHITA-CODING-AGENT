// ==============================================================================
// GHITA CODING AGENT - Playwright Adapter
// ==============================================================================

import type { BrowserControlAdapter } from './index.js';

export { HybridBrowserController } from './hybrid.js';

export interface PlaywrightAdapterOptions {
  headless?: boolean;
  channel?: string;
}

export async function createPlaywrightAdapter(
  options: PlaywrightAdapterOptions = {},
): Promise<BrowserControlAdapter> {
  const { chromium } = await import('playwright');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>> | undefined;

  // deep-review fix (L8): only http(s) navigation is allowed. Anything else
  // (file://, javascript:, data:, ...) is rejected up front so a
  // prompt-injected URL cannot turn the browser into a local file reader.
  function assertSafeUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Only http:// and https:// URLs are allowed (got ${parsed.protocol}//).`);
    }
    return parsed.toString();
  }

  async function ensurePage() {
    if (!browser) {
      browser = await chromium.launch({
        headless: options.headless ?? false,
        channel: options.channel,
      });
    }
    page ??= await browser.newPage();
    return page;
  }

  return {
    launch: async (launchOptions) => {
      if (browser) return;
      browser = await chromium.launch({
        headless: launchOptions?.headless ?? options.headless ?? false,
        channel: options.channel,
      });
      page = await browser.newPage();
    },
    close: async () => {
      await browser?.close();
      browser = undefined;
      page = undefined;
    },
    navigate: async (url) => {
      const safeUrl = assertSafeUrl(url);
      const currentPage = await ensurePage();
      await currentPage.goto(safeUrl, { waitUntil: 'domcontentloaded' });
    },
    click: async (selector) => {
      const currentPage = await ensurePage();
      await currentPage.click(selector);
    },
    fill: async (selector, value) => {
      const currentPage = await ensurePage();
      await currentPage.fill(selector, value);
    },
    extractText: async (selector = 'body') => {
      const currentPage = await ensurePage();
      return (await currentPage.textContent(selector)) ?? '';
    },
    screenshot: async () => {
      const currentPage = await ensurePage();
      const buffer = await currentPage.screenshot({ type: 'png', fullPage: true });
      return { mimeType: 'image/png', data: buffer.toString('base64') };
    },
  };
}
