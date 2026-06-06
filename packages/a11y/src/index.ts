// ==============================================================================
// GHITA CODING AGENT - Accessibility (a11y) Package (Phase 49)
// WCAG 2.1 AA compliance, screen reader, keyboard nav, high contrast
// ==============================================================================

// --- Types ---

export type A11ySeverity = 'info' | 'warning' | 'error';

export interface A11yIssue {
  id: string;
  severity: A11ySeverity;
  wcag: string;
  element: string;
  message: string;
  suggestion: string;
}

export interface A11yAuditResult {
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
  issues: A11yIssue[];
  score: number;
  wcagLevel: 'A' | 'AA' | 'AAA';
}

export interface KeyboardShortcut {
  key: string;
  modifiers: ('ctrl' | 'alt' | 'shift' | 'meta')[];
  action: string;
  description: string;
}

export interface FocusTrapConfig {
  containerSelector: string;
  initialFocusSelector?: string;
  restoreFocusOnClose: boolean;
}

// --- A11y Audit Engine ---

export class A11yAuditor {
  private rules: Array<{
    id: string;
    wcag: string;
    check: (html: string) => A11yIssue | null;
  }> = [];

  constructor() {
    this.registerDefaultRules();
  }

  /**
   * Audit an HTML string for accessibility issues.
   */
  audit(html: string): A11yAuditResult {
    const issues: A11yIssue[] = [];

    for (const rule of this.rules) {
      const issue = rule.check(html);
      if (issue) issues.push(issue);
    }

    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const info = issues.filter((i) => i.severity === 'info').length;

    // Score: 100 - (errors * 10) - (warnings * 3) - (info * 1), min 0
    const score = Math.max(0, 100 - errors * 10 - warnings * 3 - info);

    let wcagLevel: 'A' | 'AA' | 'AAA' = 'AAA';
    if (errors > 0) wcagLevel = 'A';
    else if (warnings > 0) wcagLevel = 'AA';

    return { totalIssues: issues.length, errors, warnings, info, issues, score, wcagLevel };
  }

  private registerDefaultRules(): void {
    // Images must have alt text (WCAG 1.1.1)
    this.rules.push({
      id: 'img-alt',
      wcag: '1.1.1',
      check: (html) => {
        const imgRegex = /<img\b[^>]*>/gi;
        let match: RegExpExecArray | null;
        while ((match = imgRegex.exec(html)) !== null) {
          if (!match[0].includes('alt=')) {
            return {
              id: 'img-alt',
              severity: 'error',
              wcag: '1.1.1',
              element: match[0],
              message: 'Image missing alt attribute',
              suggestion: 'Add descriptive alt text or alt="" for decorative images',
            };
          }
        }
        return null;
      },
    });

    // Form inputs must have labels (WCAG 1.3.1)
    this.rules.push({
      id: 'input-label',
      wcag: '1.3.1',
      check: (html) => {
        const inputRegex = /<input\b[^>]*>/gi;
        let match: RegExpExecArray | null;
        while ((match = inputRegex.exec(html)) !== null) {
          const hasId = match[0].match(/id="([^"]+)"/);
          const hasAriaLabel = match[0].includes('aria-label');
          const hasAriaLabelledBy = match[0].includes('aria-labelledby');
          if (hasId) {
            const id = hasId[1];
            const labelRegex = new RegExp(`<label[^>]*for="${id}"[^>]*>`, 'i');
            if (!labelRegex.test(html) && !hasAriaLabel && !hasAriaLabelledBy) {
              return {
                id: 'input-label',
                severity: 'error',
                wcag: '1.3.1',
                element: match[0],
                message: `Input with id="${id}" has no associated label`,
                suggestion: 'Add a <label for="..."> or aria-label attribute',
              };
            }
          } else if (!hasAriaLabel && !hasAriaLabelledBy) {
            return {
              id: 'input-label',
              severity: 'error',
              wcag: '1.3.1',
              element: match[0],
              message: 'Input has no id, label, or aria-label',
              suggestion: 'Add an id with associated label, or use aria-label',
            };
          }
        }
        return null;
      },
    });

    // Color contrast warning (WCAG 1.4.3)
    this.rules.push({
      id: 'color-contrast',
      wcag: '1.4.3',
      check: (html) => {
        if (html.includes('color:') && html.includes('background:')) {
          return {
            id: 'color-contrast',
            severity: 'warning',
            wcag: '1.4.3',
            element: 'inline style',
            message: 'Verify color contrast meets WCAG AA (4.5:1 for normal text)',
            suggestion: 'Use a contrast checker tool to verify ratios',
          };
        }
        return null;
      },
    });

    // Skip navigation link (WCAG 2.4.1)
    this.rules.push({
      id: 'skip-nav',
      wcag: '2.4.1',
      check: (html) => {
        if (html.includes('<nav') && !html.includes('skip')) {
          return {
            id: 'skip-nav',
            severity: 'info',
            wcag: '2.4.1',
            element: '<nav>',
            message: 'Consider adding a skip navigation link',
            suggestion: 'Add <a href="#main-content" class="skip-link">Skip to content</a>',
          };
        }
        return null;
      },
    });

    // Focus visible (WCAG 2.4.7)
    this.rules.push({
      id: 'focus-visible',
      wcag: '2.4.7',
      check: (html) => {
        if (html.includes('outline:') && html.includes('none')) {
          return {
            id: 'focus-visible',
            severity: 'warning',
            wcag: '2.4.7',
            element: 'CSS style',
            message: 'Removing outline may hide focus indicator',
            suggestion: 'Use :focus-visible instead of removing outline entirely',
          };
        }
        return null;
      },
    });
  }
}

// --- Keyboard Navigation Manager ---

export class KeyboardNavManager {
  private shortcuts = new Map<string, KeyboardShortcut>();

  /**
   * Register a keyboard shortcut.
   */
  registerShortcut(shortcut: KeyboardShortcut): void {
    const key = this.buildKey(shortcut);
    this.shortcuts.set(key, shortcut);
  }

  /**
   * Get all registered shortcuts.
   */
  getShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Match a keyboard event to a registered shortcut.
   */
  matchShortcut(event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): KeyboardShortcut | null {
    const modifiers: ('ctrl' | 'alt' | 'shift' | 'meta')[] = [];
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.altKey) modifiers.push('alt');
    if (event.shiftKey) modifiers.push('shift');
    if (event.metaKey) modifiers.push('meta');

    const key = `${modifiers.sort().join('+')}+${event.key.toLowerCase()}`;
    return this.shortcuts.get(key) ?? null;
  }

  /**
   * Generate a screen reader announcement string.
   */
  static announce(message: string, priority: 'polite' | 'assertive' = 'polite'): string {
    return `<div role="status" aria-live="${priority}" aria-atomic="true" class="sr-only">${message}</div>`;
  }

  private buildKey(shortcut: KeyboardShortcut): string {
    const mods = [...shortcut.modifiers].sort().join('+');
    return mods ? `${mods}+${shortcut.key.toLowerCase()}` : shortcut.key.toLowerCase();
  }
}

// --- High Contrast Theme ---

export const HIGH_CONTRAST_THEME = {
  '--bg-primary': '#000000',
  '--bg-secondary': '#1a1a1a',
  '--text-primary': '#ffffff',
  '--text-secondary': '#e0e0e0',
  '--border-color': '#ffffff',
  '--accent-color': '#ffff00',
  '--focus-ring': '#00ff00',
  '--error-color': '#ff4444',
  '--success-color': '#44ff44',
  '--link-color': '#66ccff',
} as const;

// --- Default Keyboard Shortcuts ---

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'n', modifiers: ['ctrl'], action: 'new-chat', description: 'New chat' },
  { key: ',', modifiers: ['ctrl'], action: 'open-settings', description: 'Open settings' },
  { key: 'f', modifiers: ['ctrl'], action: 'search', description: 'Search' },
  { key: 'escape', modifiers: [], action: 'close-modal', description: 'Close modal/dialog' },
  { key: 'tab', modifiers: ['ctrl'], action: 'next-panel', description: 'Switch to next panel' },
  { key: '/', modifiers: ['ctrl'], action: 'toggle-shortcuts', description: 'Show keyboard shortcuts' },
];
