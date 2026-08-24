// Variable interpolation with nested access, defaults, and pluralization

/** Template context: flat or nested values for interpolation */
export type TemplateContext = Record<string, string | number | boolean | Record<string, unknown>>;

/** Options for template rendering */
export interface TemplateOptions {
  /** Escape HTML entities in interpolated values (default: true) */
  escapeHtml: boolean;
}

const DEFAULT_OPTIONS: TemplateOptions = { escapeHtml: true };

// Matches {{variable}}, {{nested.path}}, {{var|default}}, {{count|item|items}}
const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

/**
 * Lightweight notification template engine.
 *
 * Syntax:
 *   {{variable}}              - simple interpolation
 *   {{nested.path}}           - dot-separated access
 *   {{variable|default}}      - fallback when variable is undefined
 *   {{count|item|items}}      - pluralization: "1 item" / "3 items"
 *   {{#raw}}...{{/raw}}       - skip HTML escaping inside block
 */
export class NotificationTemplate {
  private options: TemplateOptions;

  constructor(options?: Partial<TemplateOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Render a template string with the given context.
   *
   * @example
   * ```ts
   * const tpl = new NotificationTemplate();
   * tpl.render('Hello {{userName}}, you have {{count}} {{count|message|messages}}', {
   *   userName: 'Alice',
   *   count: 3,
   * });
   * // => 'Hello Alice, you have 3 messages'
   * ```
   */
  render(template: string, ctx: TemplateContext): string {
    // Handle raw blocks first (skip HTML escaping)
    let result = template.replace(/\{\{#raw\}\}([\s\S]*?)\{\{\/raw\}\}/g, (_match, inner: string) => {
      return this.interpolate(inner, ctx, false);
    });

    // Then interpolate everything else with escaping per options
    result = this.interpolate(result, ctx, this.options.escapeHtml);
    return result;
  }

  /**
   * Render a template for a notification title + body pair.
   * Returns both rendered strings.
   */
  renderNotification(
    title: string,
    body: string,
    ctx: TemplateContext,
  ): { title: string; body: string } {
    return {
      title: this.render(title, ctx),
      body: this.render(body, ctx),
    };
  }

  // ---- Private helpers -------------------------------------------------------

  private interpolate(text: string, ctx: TemplateContext, escape: boolean): string {
    return text.replace(TEMPLATE_RE, (_match, expr: string) => {
      const parts = expr.split('|').map((s) => s.trim());
      const path = parts[0] ?? '';
      const value = this.resolve(path, ctx);

      // Pluralization: {{count|singular|plural}}
      if (parts.length === 3 && typeof value === 'number') {
        const singular = parts[1] ?? '';
        const plural = parts[2] ?? '';
        const word = value === 1 ? singular : plural;
        return `${value} ${escape ? this.escape(word) : word}`;
      }

      // Default value: {{var|default}}
      if (parts.length === 2 && (value === undefined || value === null)) {
        const fallback = parts[1] ?? '';
        return escape ? this.escape(fallback) : fallback;
      }

      if (value === undefined || value === null) return '';

      const str = String(value);
      return escape ? this.escape(str) : str;
    });
  }

  /** Resolve a dot-separated path against the context object */
  private resolve(path: string, ctx: TemplateContext): unknown {
    const segments = path.split('.');
    let current: unknown = ctx;
    for (const seg of segments) {
      if (current === undefined || current === null) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[seg];
    }
    return current;
  }

  /** Escape HTML special characters */
  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
