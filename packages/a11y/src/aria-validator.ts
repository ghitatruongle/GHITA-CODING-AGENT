// @ghita/a11y -- ARIA Attribute Validator

import type {
  AriaValidationResult,
  AriaValidationError,
  AriaValidationWarning,
} from './types.js';

const ABSTRACT_ROLES = new Set([
  'command', 'composite', 'input', 'landmark', 'range',
  'roletype', 'section', 'sectionhead', 'select', 'structure',
  'widget', 'window',
]);

const ALL_VALID_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
  'cell', 'checkbox', 'columnheader', 'combobox', 'complementary',
  'contentinfo', 'definition', 'dialog', 'directory', 'document',
  'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group',
  'heading', 'img', 'link', 'list', 'listbox', 'listitem', 'log',
  'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none',
  'note', 'option', 'presentation', 'progressbar', 'radio', 'radiogroup',
  'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search',
  'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'switch',
  'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer',
  'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

const ROLE_REQUIRED_PROPS = new Map<string, string[]>([
  ['checkbox', ['aria-checked']],
  ['combobox', ['aria-expanded']],
  ['heading', ['aria-level']],
  ['meter', ['aria-valuenow']],
  ['option', ['aria-selected']],
  ['radio', ['aria-checked']],
  ['slider', ['aria-valuenow']],
  ['switch', ['aria-checked']],
]);

export class AriaValidator {
  validateRole(role: string): AriaValidationError | null {
    if (!role || role.trim().length === 0) {
      return { code: 'EMPTY_ROLE', attribute: 'role', message: 'Role attribute must not be empty' };
    }
    const normalized = role.trim().toLowerCase();
    if (ABSTRACT_ROLES.has(normalized)) {
      return {
        code: 'ABSTRACT_ROLE',
        attribute: 'role',
        message: `Role "${normalized}" is abstract and cannot be used directly`,
      };
    }
    if (!ALL_VALID_ROLES.has(normalized)) {
      return {
        code: 'INVALID_ROLE',
        attribute: 'role',
        message: `Unknown ARIA role: "${normalized}"`,
      };
    }
    return null;
  }

  validateProperties(props: Record<string, string>, role: string): AriaValidationResult {
    const errors: AriaValidationError[] = [];
    const warnings: AriaValidationWarning[] = [];
    const normalizedRole = role.trim().toLowerCase();

    const requiredProps = ROLE_REQUIRED_PROPS.get(normalizedRole);
    if (requiredProps) {
      for (const prop of requiredProps) {
        if (!(prop in props)) {
          errors.push({
            code: 'MISSING_REQUIRED_PROP',
            attribute: prop,
            message: `Role "${normalizedRole}" requires attribute "${prop}"`,
          });
        }
      }
    }

    for (const [attr, value] of Object.entries(props)) {
      if (!attr.startsWith('aria-')) continue;
      if (attr === 'aria-checked' || attr === 'aria-pressed') {
        if (value !== 'true' && value !== 'false' && value !== 'mixed') {
          errors.push({
            code: 'INVALID_TRISTATE',
            attribute: attr,
            message: `ARIA attribute "${attr}" must be "true", "false", or "mixed". Got "${value}"`,
          });
        }
      } else if (
        attr === 'aria-expanded' || attr === 'aria-disabled' ||
        attr === 'aria-hidden' || attr === 'aria-modal' ||
        attr === 'aria-readonly' || attr === 'aria-required' ||
        attr === 'aria-selected'
      ) {
        if (value !== 'true' && value !== 'false') {
          errors.push({
            code: 'INVALID_BOOLEAN',
            attribute: attr,
            message: `ARIA attribute "${attr}" must be "true" or "false", got "${value}"`,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateAccessibleName(
    textContent: string | undefined,
    ariaLabel: string | undefined,
    ariaLabelledby: string | undefined,
  ): { valid: boolean; suggestion: string } {
    const hasText = textContent !== undefined && textContent.trim().length > 0;
    const hasAriaLabel = ariaLabel !== undefined && ariaLabel.trim().length > 0;
    const hasLabelledby = ariaLabelledby !== undefined && ariaLabelledby.trim().length > 0;
    if (hasText || hasAriaLabel || hasLabelledby) {
      return { valid: true, suggestion: '' };
    }
    return {
      valid: false,
      suggestion: 'Element has no accessible name. Add aria-label, aria-labelledby, or visible text content.',
    };
  }
}
