import type { ThemeConfig, ThemeKind } from './types.js';

/**
 * Tracks the active theme (light/dark/auto). When 'auto', follows the OS
 * preference and emits a change event so the UI can re-render.
 */
export class ThemeManager {
  private config: ThemeConfig;
  private listeners = new Set<(c: ThemeConfig) => void>();
  private mediaQuery: { matches: boolean } | undefined;

  constructor(initial: Partial<ThemeConfig> = {}) {
    this.config = {
      kind: initial.kind ?? 'auto',
      accent: initial.accent ?? '#8b5cf6',
      fontFamily: initial.fontFamily ?? 'Inter, system-ui, sans-serif',
      fontSize: initial.fontSize ?? 14,
    };
  }

  /**
   * Get the resolved theme kind (auto → light/dark).
   */
  getResolved(): 'light' | 'dark' {
    if (this.config.kind !== 'auto') return this.config.kind;
    return this.mediaQuery?.matches ? 'dark' : 'light';
  }

  /**
   * Get the current config.
   */
  getConfig(): ThemeConfig {
    return { ...this.config };
  }

  /**
   * Switch the theme kind.
   */
  setKind(kind: ThemeKind): void {
    if (this.config.kind === kind) return;
    this.config.kind = kind;
    this.emit();
  }

  /**
   * Set accent color.
   */
  setAccent(hex: string): void {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`Invalid hex color: ${hex}`);
    this.config.accent = hex;
    this.emit();
  }

  /**
   * Set font size in px.
   */
  setFontSize(px: number): void {
    if (px < 8 || px > 32) throw new Error('Font size must be between 8 and 32');
    this.config.fontSize = px;
    this.emit();
  }

  /**
   * Subscribe to theme changes.
   */
  onChange(listener: (c: ThemeConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Inject a system-preference detector (e.g. from Tauri's window).
   */
  setMediaQuery(mq: { matches: boolean }): void {
    this.mediaQuery = mq;
    if (this.config.kind === 'auto') this.emit();
  }

  /** Generate CSS custom-properties from the current config */
  toCssVars(): Record<string, string> {
    return {
      '--ghita-accent': this.config.accent,
      '--ghita-font': this.config.fontFamily,
      '--ghita-font-size': `${this.config.fontSize}px`,
      '--ghita-theme': this.getResolved(),
    };
  }

  private emit(): void {
    for (const l of this.listeners) {
      try {
        l(this.getConfig());
      } catch {
        // ignore
      }
    }
  }
}
