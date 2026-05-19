declare module 'playwright' {
  export interface Browser {
    close(): Promise<void>;
    newPage(): Promise<Page>;
  }

  export interface Page {
    goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<unknown>;
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    textContent(selector: string): Promise<string | null>;
    screenshot(options?: { type?: 'png'; fullPage?: boolean }): Promise<Buffer>;
  }

  export const chromium: {
    launch(options?: { headless?: boolean; channel?: string }): Promise<Browser>;
  };
}
