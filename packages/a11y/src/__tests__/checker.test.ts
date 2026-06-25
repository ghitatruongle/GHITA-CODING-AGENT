// ==============================================================================
// @ghita/a11y -- Comprehensive Tests
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AccessibilityChecker } from '../checker.js';
import type { ElementDescriptor } from '../checker.js';
import { ColorContrastAnalyzer } from '../color-contrast.js';
import { AriaValidator } from '../aria-validator.js';
import { ScreenReaderHelper } from '../screen-reader.js';

// ============================================================
// AccessibilityChecker
// ============================================================

describe('AccessibilityChecker', () => {
  let checker: AccessibilityChecker;

  beforeEach(() => {
    checker = new AccessibilityChecker({ threshold: 80 });
  });

  it('returns passing report for empty element list', () => {
    const report = checker.audit([]);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.issues).toHaveLength(0);
  });

  it('detects images missing alt text', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'img', attributes: { src: 'photo.jpg' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-IMG-001')).toBe(true);
  });

  it('passes images with alt text', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'img', attributes: { src: 'photo.jpg', alt: 'A sunset' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.filter((i) => i.category === 'images')).toHaveLength(0);
  });

  it('allows alt="" for decorative images', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'img', attributes: { src: 'deco.png', alt: '' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.filter((i) => i.category === 'images')).toHaveLength(0);
  });

  it('detects insufficient color contrast', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'p', attributes: {}, computedStyles: { color: '#777777', backgroundColor: '#ffffff' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-CONTRAST-001')).toBe(true);
  });

  it('passes sufficient color contrast', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'p', attributes: {}, computedStyles: { color: '#000000', backgroundColor: '#ffffff' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.filter((i) => i.category === 'color-contrast')).toHaveLength(0);
  });

  it('detects invalid ARIA roles', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'div', attributes: { role: 'nonsense' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-ARIA-001')).toBe(true);
  });

  it('detects abstract ARIA roles', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'div', attributes: { role: 'widget' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-ARIA-001')).toBe(true);
  });

  it('detects positive tabindex', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'button', attributes: { tabindex: '5' }, textContent: 'Click' },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-KB-001')).toBe(true);
  });

  it('detects form elements without labels', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'input', attributes: { type: 'text' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-FORM-001')).toBe(true);
  });

  it('passes form elements with aria-label', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'input', attributes: { type: 'text', 'aria-label': 'Email' } },
    ];
    const report = checker.audit(elements);
    expect(report.issues.filter((i) => i.category === 'forms')).toHaveLength(0);
  });

  it('detects empty headings', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'h2', attributes: {}, textContent: '' },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-SEM-001')).toBe(true);
  });

  it('detects links with no accessible name', () => {
    const elements: ElementDescriptor[] = [
      { tagName: 'a', attributes: { href: '/page' }, textContent: '' },
    ];
    const report = checker.audit(elements);
    expect(report.issues.some((i) => i.id === 'A11Y-SEM-002')).toBe(true);
  });

  it('respects skipIds configuration', () => {
    const skipChecker = new AccessibilityChecker({ threshold: 80, skipIds: ['A11Y-IMG-001'] });
    const elements: ElementDescriptor[] = [{ tagName: 'img', attributes: {} }];
    const report = skipChecker.audit(elements);
    expect(report.issues.filter((i) => i.id === 'A11Y-IMG-001')).toHaveLength(0);
  });

  it('respects categories configuration', () => {
    const catChecker = new AccessibilityChecker({ threshold: 80, categories: ['images'] });
    const elements: ElementDescriptor[] = [
      { tagName: 'img', attributes: {} },
      { tagName: 'h2', attributes: {}, textContent: '' },
    ];
    const report = catChecker.audit(elements);
    expect(report.issues.every((i) => i.category === 'images')).toBe(true);
  });
});

// ============================================================
// ColorContrastAnalyzer
// ============================================================

describe('ColorContrastAnalyzer', () => {
  let analyzer: ColorContrastAnalyzer;

  beforeEach(() => {
    analyzer = new ColorContrastAnalyzer();
  });

  it('parses #RGB', () => {
    expect(analyzer.parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('parses #RRGGBB', () => {
    expect(analyzer.parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('parses rgb()', () => {
    expect(analyzer.parseColor('rgb(128, 64, 32)')).toEqual({ r: 128, g: 64, b: 32 });
  });

  it('parses named colors', () => {
    expect(analyzer.parseColor('white')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('throws on invalid color', () => {
    expect(() => analyzer.parseColor('notacolor')).toThrow();
  });

  it('returns ~1 luminance for white', () => {
    expect(analyzer.relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2);
  });

  it('returns ~0 luminance for black', () => {
    expect(analyzer.relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 2);
  });

  it('returns 21:1 for black on white', () => {
    expect(analyzer.contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for same color', () => {
    expect(analyzer.contrastRatio({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 })).toBeCloseTo(1, 1);
  });

  it('passes AA for black on white', () => {
    const r = analyzer.checkContrast('#000', '#fff');
    expect(r.passAA).toBe(true);
    expect(r.passAAA).toBe(true);
  });

  it('fails AA for low contrast', () => {
    const r = analyzer.checkContrast('#aaa', '#ccc');
    expect(r.passAA).toBe(false);
  });
});

// ============================================================
// AriaValidator
// ============================================================

describe('AriaValidator', () => {
  let validator: AriaValidator;

  beforeEach(() => {
    validator = new AriaValidator();
  });

  it('returns null for valid roles', () => {
    expect(validator.validateRole('button')).toBeNull();
    expect(validator.validateRole('navigation')).toBeNull();
  });

  it('returns error for unknown roles', () => {
    expect(validator.validateRole('foobar')?.code).toBe('INVALID_ROLE');
  });

  it('returns error for abstract roles', () => {
    expect(validator.validateRole('widget')?.code).toBe('ABSTRACT_ROLE');
  });

  it('returns error for empty role', () => {
    expect(validator.validateRole('')?.code).toBe('EMPTY_ROLE');
  });

  it('reports missing required properties', () => {
    const r = validator.validateProperties({}, 'checkbox');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'MISSING_REQUIRED_PROP')).toBe(true);
  });

  it('passes with valid properties', () => {
    const r = validator.validateProperties({ 'aria-checked': 'true' }, 'checkbox');
    expect(r.errors.filter((e) => e.code === 'MISSING_REQUIRED_PROP')).toHaveLength(0);
  });

  it('validates tristate values', () => {
    const r = validator.validateProperties({ 'aria-checked': 'maybe' }, 'checkbox');
    expect(r.errors.some((e) => e.code === 'INVALID_TRISTATE')).toBe(true);
  });

  it('validates accessible name', () => {
    expect(validator.validateAccessibleName('text', undefined, undefined).valid).toBe(true);
    expect(validator.validateAccessibleName(undefined, 'label', undefined).valid).toBe(true);
    expect(validator.validateAccessibleName(undefined, undefined, undefined).valid).toBe(false);
  });
});

// ============================================================
// ScreenReaderHelper
// ============================================================

describe('ScreenReaderHelper', () => {
  let helper: ScreenReaderHelper;

  beforeEach(() => {
    helper = new ScreenReaderHelper();
  });

  it('prefers aria-label over text', () => {
    const r = helper.resolveAccessibleName('button', { 'aria-label': 'Close' }, 'X');
    expect(r.accessibleName).toBe('Close');
    expect(r.needsLabel).toBe(false);
  });

  it('uses text content as fallback', () => {
    const r = helper.resolveAccessibleName('button', {}, 'Submit');
    expect(r.accessibleName).toBe('Submit');
  });

  it('flags when no label', () => {
    const r = helper.resolveAccessibleName('button', {});
    expect(r.needsLabel).toBe(true);
  });

  it('uses alt text for images', () => {
    const r = helper.resolveAccessibleName('img', { alt: 'Logo' });
    expect(r.accessibleName).toBe('Logo');
  });

  it('queues and flushes announcements', () => {
    helper.announce('Done');
    helper.announce('Error', 'assertive');
    expect(helper.pendingCount()).toBe(2);
    const a = helper.flushAnnouncements();
    expect(a).toHaveLength(2);
    expect(a[0]?.priority).toBe('polite');
    expect(a[1]?.priority).toBe('assertive');
    expect(helper.pendingCount()).toBe(0);
  });

  it('describes empty list', () => {
    expect(helper.describeList([])).toBe('Empty list');
  });

  it('describes list with items', () => {
    expect(helper.describeList(['A', 'B', 'C'])).toBe('List with 3 items: A, B, C');
  });

  it('describes ordered list', () => {
    expect(helper.describeList(['First', 'Second'], 'ordered')).toBe('Numbered list with 2 items: First, Second');
  });

  it('describes table', () => {
    expect(helper.describeTable(3, 4)).toBe('Table with 3 rows and 4 columns');
  });

  it('describes table with caption', () => {
    expect(helper.describeTable(2, 2, 'Sales')).toBe('Table "Sales" with 2 rows and 2 columns');
  });

  it('describes progress', () => {
    expect(helper.describeProgress(50, 100)).toBe('50% complete');
    expect(helper.describeProgress(3, 10, 'Upload')).toBe('Upload: 30% complete');
    expect(helper.describeProgress(0, 0)).toBe('0% complete');
  });

  it('generates live region attributes', () => {
    const polite = helper.liveRegionAttributes('polite');
    expect(polite['aria-live']).toBe('polite');
    expect(polite['role']).toBe('status');
    const assertive = helper.liveRegionAttributes('assertive');
    expect(assertive['aria-live']).toBe('assertive');
    expect(assertive['role']).toBe('alert');
  });

  it('generates skip link', () => {
    const l = helper.skipLink('main');
    expect(l.href).toBe('#main');
    expect(l.text).toBe('Skip to main');
    const custom = helper.skipLink('nav', 'Jump to nav');
    expect(custom.text).toBe('Jump to nav');
  });
});
