import { GuiGrounder } from '@ghita/computer-use';
import {
  extractInteractiveElements,
  formatAccessibilityTree,
  type InteractiveElement,
} from './dom-extractor.js';

import type { Browser, Page } from 'playwright';

export class HybridBrowserController {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private grounder: GuiGrounder;

  constructor() {
    this.grounder = new GuiGrounder();
  }

  /**
   * Launch a browser session
   */
  async launch(options: { headless?: boolean; channel?: string } = {}): Promise<void> {
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      headless: options.headless ?? false,
      channel: options.channel,
    });
    this.page = await this.browser.newPage();
  }

  /**
   * Close the browser session
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Only http:// and https:// URLs are allowed (got ${parsed.protocol}//).`);
    }
    await this.page.goto(parsed.toString(), { waitUntil: 'domcontentloaded' });
  }

  /**
   * Click an element using a standard CSS selector, or fall back to vision grounding if it fails or if a NL description is provided.
   */
  async click(selectorOrDescription: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');

    // 1. Try DOM selector if it looks like one (doesn't contain spaces and starts with valid selector char)
    const isLikelySelector = /^[a-zA-Z0-9#._[\]:=-]+$/.test(selectorOrDescription);

    if (isLikelySelector) {
      try {
        console.info(`[HybridController] Trying DOM click for selector: ${selectorOrDescription}`);
        await this.page.click(selectorOrDescription, { timeout: 3000 });
        return;
      } catch (err) {
        if (process.env.NODE_ENV !== 'production')
          console.warn(
            `[HybridController] DOM click failed for "${selectorOrDescription}". Falling back to vision grounding.`,
            err,
          );
      }
    }

    // 2. Fallback to vision grounding
    console.info(`[HybridController] Grounding description visually: "${selectorOrDescription}"`);
    const screenshot = await this.screenshot();
    const viewportSize = this.page.viewportSize();
    if (!viewportSize) throw new Error('Failed to retrieve viewport size from Playwright page.');

    const size = { width: viewportSize.width, height: viewportSize.height };
    const grounding = await this.grounder.ground(screenshot.data, selectorOrDescription, size);

    if (!grounding.point) {
      throw new Error(
        `Vision grounding failed: Could not resolve coordinates for "${selectorOrDescription}"`,
      );
    }

    console.info(
      `[HybridController] Vision click at coordinates: [${grounding.point.x}, ${grounding.point.y}]`,
    );
    await this.page.mouse.click(grounding.point.x, grounding.point.y);
  }

  /**
   * Fill an input element using selector or fall back to vision grounding.
   */
  async fill(selectorOrDescription: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');

    const isLikelySelector = /^[a-zA-Z0-9#._[\]:=-]+$/.test(selectorOrDescription);

    if (isLikelySelector) {
      try {
        console.info(`[HybridController] Trying DOM fill for selector: ${selectorOrDescription}`);
        await this.page.fill(selectorOrDescription, value, { timeout: 3000 });
        return;
      } catch (err) {
        if (process.env.NODE_ENV !== 'production')
          console.warn(
            `[HybridController] DOM fill failed for "${selectorOrDescription}". Falling back to vision grounding.`,
            err,
          );
      }
    }

    // Fallback: click target point and type
    console.info(`[HybridController] Grounding target input visually: "${selectorOrDescription}"`);
    const screenshot = await this.screenshot();
    const viewportSize = this.page.viewportSize();
    if (!viewportSize) throw new Error('Failed to retrieve viewport size.');

    const size = { width: viewportSize.width, height: viewportSize.height };
    const grounding = await this.grounder.ground(screenshot.data, selectorOrDescription, size);

    if (!grounding.point) {
      throw new Error(
        `Vision grounding failed: Could not resolve coordinates for "${selectorOrDescription}"`,
      );
    }

    console.info(
      `[HybridController] Vision fill: clicking at [${grounding.point.x}, ${grounding.point.y}]`,
    );
    await this.page.mouse.click(grounding.point.x, grounding.point.y);
    // Double click to select existing text before typing
    await this.page.mouse.click(grounding.point.x, grounding.point.y, { clickCount: 2 });
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.type(value);
  }

  /**
   * Take screenshot of the browser page
   */
  async screenshot(): Promise<{ mimeType: string; data: string }> {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');
    const buffer = await this.page.screenshot({ type: 'png' });
    return {
      mimeType: 'image/png',
      data: buffer.toString('base64'),
    };
  }

  /**
   * Extract text from page selector
   */
  async extractText(selector: string = 'body'): Promise<string> {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');
    return (await this.page.textContent(selector)) ?? '';
  }

  /**
   * Extract list of visible interactive elements
   */
  async getInteractiveElements(): Promise<InteractiveElement[]> {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');
    return await extractInteractiveElements(this.page);
  }

  /**
   * Get accessibility tree representation of the current page
   */
  async getAccessibilityTree(): Promise<string> {
    const elements = await this.getInteractiveElements();
    return formatAccessibilityTree(elements);
  }
}
