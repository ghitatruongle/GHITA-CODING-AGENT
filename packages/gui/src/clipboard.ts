// ==============================================================================
// GHITA CODING AGENT - Clipboard Abstraction (Phase 33)
// Cross-platform clipboard read/write with Tauri + browser fallback
// ==============================================================================

/**
 * Unified clipboard service. Delegates to Tauri's clipboard plugin when
 * available, otherwise falls back to the browser Clipboard API.
 */
export class ClipboardService {
  private tauriAvailable: boolean | null = null;

  private dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;

  private async isTauriAvailable(): Promise<boolean> {
    if (this.tauriAvailable !== null) return this.tauriAvailable;
    try {
      const mod = await this.dynamicImport('@tauri-apps/plugin-clipboard-manager');
      this.tauriAvailable = typeof mod['writeText'] === 'function';
    } catch {
      this.tauriAvailable = false;
    }
    return this.tauriAvailable;
  }

  /** Read plain text from the clipboard. */
  async readText(): Promise<string> {
    if (await this.isTauriAvailable()) {
      try {
        const mod = await this.dynamicImport('@tauri-apps/plugin-clipboard-manager');
        const readText = mod['readText'] as () => Promise<string>;
        return (await readText()) ?? '';
      } catch {
        // fall through to browser
      }
    }
    if (navigator?.clipboard?.readText) {
      return navigator.clipboard.readText();
    }
    return '';
  }

  /** Write plain text to the clipboard. */
  async writeText(text: string): Promise<boolean> {
    if (await this.isTauriAvailable()) {
      try {
        const mod = await this.dynamicImport('@tauri-apps/plugin-clipboard-manager');
        const writeText = mod['writeText'] as (text: string) => Promise<void>;
        await writeText(text);
        return true;
      } catch {
        // fall through
      }
    }
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Check if the clipboard has any content. */
  async hasContent(): Promise<boolean> {
    const text = await this.readText();
    return text.length > 0;
  }

  /** Clear the clipboard (write empty string). */
  async clear(): Promise<void> {
    await this.writeText('');
  }
}
