// ==============================================================================
// GHITA CODING AGENT - Native Dialog Abstractions (Phase 33)
// Wrappers around Tauri's dialog API with graceful fallback
// ==============================================================================

/** Result of a confirm/prompt dialog */
export interface DialogResult<T = boolean> {
  confirmed: boolean;
  value?: T;
}

/** Options for dialog display */
export interface DialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
}

/** File picker filter */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Abstracted dialog service. In production, this delegates to Tauri's dialog
 * plugin. When Tauri is unavailable (e.g. during tests or in the browser),
 * it falls back to native browser dialogs.
 */
export class DialogService {
  private tauriAvailable: boolean | null = null;

  // Use indirect import to avoid compile-time module resolution
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  private dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;

  private async isTauriAvailable(): Promise<boolean> {
    if (this.tauriAvailable !== null) return this.tauriAvailable;
    try {
      const mod = await this.dynamicImport('@tauri-apps/plugin-dialog');
      this.tauriAvailable = typeof mod['ask'] === 'function';
    } catch {
      this.tauriAvailable = false;
    }
    return this.tauriAvailable;
  }

  /** Show a confirm/cancel dialog. */
  async confirm(message: string, opts?: DialogOptions): Promise<DialogResult> {
    if (await this.isTauriAvailable()) {
      try {
        const mod = await this.dynamicImport('@tauri-apps/plugin-dialog');
        const tauriConfirm = mod['confirm'] as (msg: string, opts: Record<string, unknown>) => Promise<boolean>;
        const result = await tauriConfirm(message, {
          title: opts?.title ?? 'Confirm',
          kind: opts?.kind ?? 'info',
          okLabel: opts?.okLabel ?? 'OK',
          cancelLabel: opts?.cancelLabel ?? 'Cancel',
        });
        return { confirmed: result };
      } catch {
        // fall through to browser fallback
      }
    }
    // Browser fallback
    const confirmed = globalThis.confirm(message);
    return { confirmed };
  }

  /** Show a text prompt dialog. */
  async prompt(message: string, defaultValue = '', _opts?: DialogOptions): Promise<DialogResult<string>> {
    if (await this.isTauriAvailable()) {
      // Tauri doesn't have a built-in prompt, use a custom approach
      // For now, fall back to browser prompt
    }
    const value = globalThis.prompt(message, defaultValue);
    return { confirmed: value !== null, value: value ?? undefined };
  }

  /** Open a file picker dialog. */
  async pickFile(filters?: FileFilter[], multiple = false): Promise<DialogResult<string[]>> {
    if (await this.isTauriAvailable()) {
      try {
        const mod = await this.dynamicImport('@tauri-apps/plugin-dialog');
        const open = mod['open'] as (opts: Record<string, unknown>) => Promise<string | string[] | null>;
        const result = await open({
          multiple,
          filters: filters?.map((f) => ({ name: f.name, extensions: f.extensions })),
        });
        if (!result) return { confirmed: false };
        const files = Array.isArray(result) ? result : [result];
        return { confirmed: true, value: files as string[] };
      } catch {
        // fall through
      }
    }
    return { confirmed: false };
  }

  /** Open a save-file dialog. */
  async saveFile(defaultName?: string, filters?: FileFilter[]): Promise<DialogResult<string>> {
    if (await this.isTauriAvailable()) {
      try {
        const mod = await this.dynamicImport('@tauri-apps/plugin-dialog');
        const save = mod['save'] as (opts: Record<string, unknown>) => Promise<string | null>;
        const result = await save({
          defaultPath: defaultName,
          filters: filters?.map((f) => ({ name: f.name, extensions: f.extensions })),
        });
        if (!result) return { confirmed: false };
        return { confirmed: true, value: result };
      } catch {
        // fall through
      }
    }
    return { confirmed: false };
  }
}
