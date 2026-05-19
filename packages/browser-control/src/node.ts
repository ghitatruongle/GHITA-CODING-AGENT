// ==============================================================================
// GHITA CODING AGENT - Playwright Adapter
// ==============================================================================

import type { BrowserControlAdapter } from './index.js';

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
      const currentPage = await ensurePage();
      await currentPage.goto(url, { waitUntil: 'domcontentloaded' });
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
