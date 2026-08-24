// @ghita/a11y -- Accessibility Checker (Orchestrator)

import { randomUUID } from 'node:crypto';
import type {
  A11yIssue,
  A11yReport,
  A11ySeverity,
  A11yCategory,
  A11yCheckerConfig,
} from './types.js';
import { ColorContrastAnalyzer } from './color-contrast.js';
import { AriaValidator } from './aria-validator.js';
import { ScreenReaderHelper } from './screen-reader.js';

export interface ElementDescriptor {
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
  selector?: string;
  outerHtml?: string;
  computedStyles?: { color?: string; backgroundColor?: string; fontSize?: string };
  children?: ElementDescriptor[];
}

export class AccessibilityChecker {
  private readonly contrastAnalyzer: ColorContrastAnalyzer;
  private readonly ariaValidator: AriaValidator;
  private readonly screenReaderHelper: ScreenReaderHelper;
  private readonly config: Required<A11yCheckerConfig>;

  constructor(config: A11yCheckerConfig = {}) {
    this.contrastAnalyzer = new ColorContrastAnalyzer();
    this.ariaValidator = new AriaValidator();
    this.screenReaderHelper = new ScreenReaderHelper();
    this.config = {
      threshold: config.threshold ?? 80,
      wcagLevel: config.wcagLevel ?? 'AA',
      categories: config.categories ?? [
        'color-contrast', 'aria', 'keyboard', 'screen-reader',
        'semantic-html', 'forms', 'images', 'focus-management', 'motion',
      ],
      skipIds: config.skipIds ?? [],
    };
  }

  audit(elements: ElementDescriptor[]): A11yReport {
    const issues: A11yIssue[] = [];
    for (const el of elements) {
      issues.push(...this.checkElement(el));
    }
    const filteredIssues = this.config.skipIds.length > 0
      ? issues.filter((i) => !this.config.skipIds.includes(i.id))
      : issues;
    const counts: Record<A11ySeverity, number> = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const issue of filteredIssues) counts[issue.severity]++;
    const score = this.computeScore(filteredIssues, elements.length);
    return {
      id: randomUUID(),
      runAt: Date.now(),
      issues: filteredIssues,
      counts,
      score,
      passed: score >= this.config.threshold,
      threshold: this.config.threshold,
    };
  }

  checkElement(el: ElementDescriptor): A11yIssue[] {
    const issues: A11yIssue[] = [];
    const now = Date.now();

    // Images
    if (this.shouldCheck('images') && el.tagName === 'img') {
      const alt = el.attributes['alt'];
      if (alt === undefined || alt === null) {
        issues.push({
          id: 'A11Y-IMG-001', category: 'images', severity: 'error',
          wcagLevel: 'A', wcagCriterion: '1.1.1', title: 'Image missing alt text',
          description: 'Images must have an alt attribute.', selector: el.selector,
          element: el.outerHtml, remediation: 'Add an alt attribute.', detectedAt: now,
        });
      }
    }

    // Color contrast
    if (this.shouldCheck('color-contrast')) {
      const fg = el.computedStyles?.color;
      const bg = el.computedStyles?.backgroundColor;
      if (fg && bg) {
        try {
          const result = this.contrastAnalyzer.checkContrast(fg, bg);
          const minRatio = this.config.wcagLevel === 'AAA' ? 7.0 : 4.5;
          if (result.ratio < minRatio) {
            issues.push({
              id: 'A11Y-CONTRAST-001', category: 'color-contrast', severity: 'error',
              wcagLevel: this.config.wcagLevel, wcagCriterion: '1.4.3',
              title: 'Insufficient color contrast',
              description: `Contrast ratio ${result.ratio}:1 is below ${minRatio}:1.`,
              selector: el.selector, remediation: 'Increase contrast.', detectedAt: now,
            });
          }
        } catch { /* skip invalid colors */ }
      }
    }

    // ARIA
    if (this.shouldCheck('aria')) {
      const role = el.attributes['role'];
      if (role !== undefined) {
        const roleError = this.ariaValidator.validateRole(role);
        if (roleError) {
          issues.push({
            id: 'A11Y-ARIA-001', category: 'aria', severity: 'error',
            wcagLevel: 'A', wcagCriterion: '4.1.2',
            title: `Invalid ARIA role: ${role}`, description: roleError.message,
            selector: el.selector, remediation: 'Use a valid ARIA role.', detectedAt: now,
          });
        }
      }
    }

    // Keyboard
    if (this.shouldCheck('keyboard')) {
      const tabIndex = el.attributes['tabindex'];
      if (tabIndex !== undefined) {
        const val = parseInt(tabIndex, 10);
        if (val > 0) {
          issues.push({
            id: 'A11Y-KB-001', category: 'keyboard', severity: 'warning',
            wcagLevel: 'A', wcagCriterion: '2.4.3', title: 'Positive tabindex value',
            description: `tabindex="${val}" creates custom tab order.`,
            selector: el.selector, remediation: 'Use tabindex="0" or tabindex="-1".', detectedAt: now,
          });
        }
      }
    }

    // Forms
    if (this.shouldCheck('forms') && ['input', 'select', 'textarea'].includes(el.tagName)) {
      const hasLabel = Boolean(
        el.attributes['aria-label'] || el.attributes['aria-labelledby'] ||
        el.attributes['title'] || el.attributes['placeholder'] || el.attributes['id']
      );
      if (!hasLabel) {
        issues.push({
          id: 'A11Y-FORM-001', category: 'forms', severity: 'error',
          wcagLevel: 'A', wcagCriterion: '1.3.1', title: 'Form element missing label',
          description: 'Form inputs must have an associated label.',
          selector: el.selector, remediation: 'Add a <label>, aria-label, or aria-labelledby.', detectedAt: now,
        });
      }
    }

    // Semantic HTML
    if (this.shouldCheck('semantic-html')) {
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName)) {
        if (!el.textContent || el.textContent.trim().length === 0) {
          issues.push({
            id: 'A11Y-SEM-001', category: 'semantic-html', severity: 'error',
            wcagLevel: 'A', wcagCriterion: '1.3.1', title: 'Empty heading element',
            description: `Heading <${el.tagName}> has no text.`,
            selector: el.selector, remediation: 'Add text or remove heading.', detectedAt: now,
          });
        }
      }
      if (el.tagName === 'a') {
        const text = el.textContent?.trim() ?? '';
        const ariaLabel = el.attributes['aria-label'] ?? '';
        if (!text && !ariaLabel) {
          issues.push({
            id: 'A11Y-SEM-002', category: 'semantic-html', severity: 'error',
            wcagLevel: 'A', wcagCriterion: '2.4.4', title: 'Link has no accessible name',
            description: 'Links must have discernible text.',
            selector: el.selector, remediation: 'Add link text or aria-label.', detectedAt: now,
          });
        }
      }
    }

    return issues;
  }

  private shouldCheck(category: A11yCategory): boolean {
    return this.config.categories.includes(category);
  }

  private computeScore(issues: A11yIssue[], elementCount: number): number {
    if (elementCount === 0) return 100;
    let penalty = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical': penalty += 15; break;
        case 'error': penalty += 10; break;
        case 'warning': penalty += 5; break;
        case 'info': penalty += 1; break;
      }
    }
    const maxPenalty = elementCount * 15;
    const normalized = Math.min(penalty / Math.max(maxPenalty, 1), 1);
    return Math.max(0, Math.round((1 - normalized) * 100));
  }

  getConfig(): Required<A11yCheckerConfig> { return { ...this.config }; }
  getContrastAnalyzer(): ColorContrastAnalyzer { return this.contrastAnalyzer; }
  getAriaValidator(): AriaValidator { return this.ariaValidator; }
  getScreenReaderHelper(): ScreenReaderHelper { return this.screenReaderHelper; }
}
