# GHITA CODING AGENT — Project Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve all 7 project areas (Architecture, Testing, Security, Code Quality, Multiplatform, Dependencies, Community) from current scores to target scores.

**Architecture:** 7 parallel streams, each independently actionable. Streams are ordered by dependency — Stream 1 (Architecture) and Stream 4 (Code Quality) should start first as they create foundations for other streams.

**Tech Stack:** TypeScript, Vitest, Playwright, ESLint, Prettier, Husky, commitlint, StrykerJS, Renovate, SonarQube/SonarCloud, Tauri v2, React Native

---

## File Structure Overview

### New Files to Create

```
packages/a11y/
  src/index.ts, types.ts, checker.ts, aria-validator.ts, color-contrast.ts, screen-reader.ts
  src/__tests__/checker.test.ts
  package.json, tsconfig.json, vitest.config.ts, README.md

packages/i18n/
  src/index.ts, types.ts, manager.ts, loader.ts, detector.ts, formatter.ts
  src/__tests__/manager.test.ts
  package.json, tsconfig.json, vitest.config.ts, README.md

packages/migration/
  src/index.ts, types.ts, runner.ts, registry.ts, version-detector.ts
  src/__tests__/runner.test.ts
  package.json, tsconfig.json, vitest.config.ts, README.md

packages/mobile-companion/
  src/index.ts, types.ts, bluetooth.ts, network-discovery.ts, push-bridge.ts, device-capabilities.ts
  src/__tests__/bluetooth.test.ts
  package.json, tsconfig.json, vitest.config.ts, README.md

packages/integration/
  src/index.ts, types.ts, core.ts, event-bus.ts, service-registry.ts, health-check.ts
  src/__tests__/core.test.ts
  package.json, tsconfig.json, vitest.config.ts, README.md

packages/relay-server/
  src/index.ts, types.ts, server.ts, room-manager.ts, connection-broker.ts, rate-limiter.ts
  src/__tests__/server.test.ts
  package.json, tsconfig.json, vitest.config.ts, README.md

docs/adr/
  001-monorepo-pnpm-turborepo.md
  002-tauri-v2-desktop.md
  003-adapter-pattern-over-di.md
  004-zustand-state-management.md
  005-socket-io-communication.md
  006-aes-256-gcm-encryption.md
  007-vitest-test-runner.md
  008-parallel-streams-improvement.md

tests/e2e/visual/
  visual-regression.spec.ts

tests/fuzz/
  expanded-fuzz.test.ts

stryker.config.mjs

.github/workflows/
  mutation-testing.yml
  license-scan.yml
  security-enhanced.yml

renovate.json

docs/security/
  penetration-testing-checklist.md

docs/onboarding/
  getting-started.md
  development-setup.md
  architecture-overview.md
  first-contribution.md
  skill-development.md
  plugin-development.md

examples/
  custom-skill/README.md, package.json, src/index.ts, src/__tests__/index.test.ts
  agent-workflow/README.md, package.json, src/index.ts
  remote-control/README.md, package.json, src/index.ts
  browser-automation/README.md, package.json, src/index.ts
  computer-use/README.md, package.json, src/index.ts
  mcp-server/README.md, package.json, src/index.ts

templates/
  skill/package.json, src/index.ts, README.md
  agent/config.yaml, README.md
  mcp-server/package.json, src/index.ts, README.md

.all-contributorsrc

snap/snapcraft.yaml
flatpak/com.ghita.CodingAgent.yml
```

### Files to Modify

```
eslint.config.js                    — Add complexity rules
.husky/commit-msg                   — Wire commitlint hook
.github/workflows/ci.yml           — Add coverage 90%, visual regression, license scan
.github/workflows/security-scan.yml — Add semgrep, trivy, gitleaks
.github/workflows/build-ios.yml     — Polish iOS build
.github/workflows/build-desktop.yml — Add macOS signing
apps/desktop/src-tauri/tauri.conf.json — CSP hardening (remove unsafe-inline)
packages/shared/src/types.ts        — Add 'ios' to Platform type
package.json                        — Add renovate config, update scripts
README.md                           — Add contributors table
pnpm-workspace.yaml                 — Add new packages
tsconfig.base.json                  — Add path aliases for new packages
turbo.json                          — Add new package build tasks
```

---

## Stream 1: Architecture & Structure

### Task 1.1: Create `@ghita/a11y` Package

**Files:**

- Create: `packages/a11y/package.json`
- Create: `packages/a11y/tsconfig.json`
- Create: `packages/a11y/vitest.config.ts`
- Create: `packages/a11y/src/types.ts`
- Create: `packages/a11y/src/checker.ts`
- Create: `packages/a11y/src/aria-validator.ts`
- Create: `packages/a11y/src/color-contrast.ts`
- Create: `packages/a11y/src/screen-reader.ts`
- Create: `packages/a11y/src/index.ts`
- Create: `packages/a11y/src/__tests__/checker.test.ts`
- Create: `packages/a11y/README.md`
- Modify: `pnpm-workspace.yaml` (no change needed — `packages/*` already covers it)
- Modify: `tsconfig.base.json` — add path alias
- Modify: `turbo.json` — no change needed (wildcard filter covers new packages)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@ghita/a11y",
  "version": "0.0.4",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist tsconfig.tsbuildinfo"
  },
  "dependencies": {
    "@ghita/shared": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/index.ts'],
    },
  },
});
```

- [ ] **Step 4: Create src/types.ts**

```typescript
export interface AccessibilityCheckResult {
  readonly passed: boolean;
  readonly issues: AccessibilityIssue[];
  readonly score: number; // 0-100
}

export interface AccessibilityIssue {
  readonly id: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly rule: string;
  readonly message: string;
  readonly element?: string;
  readonly wcagReference?: string;
}

export interface ColorContrastResult {
  readonly ratio: number;
  readonly meetsAA: boolean;
  readonly meetsAAA: boolean;
  readonly foreground: string;
  readonly background: string;
}

export interface AriaValidationResult {
  readonly valid: boolean;
  readonly errors: AriaError[];
}

export interface AriaError {
  readonly element: string;
  readonly attribute: string;
  readonly message: string;
}
```

- [ ] **Step 5: Create src/checker.ts**

```typescript
import type { AccessibilityCheckResult, AccessibilityIssue } from './types.js';

export class AccessibilityChecker {
  private readonly issues: AccessibilityIssue[] = [];

  check(html: string): AccessibilityCheckResult {
    this.issues.length = 0;
    this.checkImages(html);
    this.checkHeadings(html);
    this.checkForms(html);
    this.checkLinks(html);
    const errorCount = this.issues.filter((i) => i.severity === 'error').length;
    const score = Math.max(0, 100 - errorCount * 10 - this.issues.length * 2);
    return {
      passed: errorCount === 0,
      issues: [...this.issues],
      score,
    };
  }

  private checkImages(html: string): void {
    const imgRegex = /<img\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(html)) !== null) {
      const tag = match[0];
      if (!/alt\s*=/i.test(tag)) {
        this.issues.push({
          id: 'a11y-img-alt',
          severity: 'error',
          rule: 'image-alt',
          message: 'Image missing alt attribute',
          element: tag,
          wcagReference: 'WCAG 1.1.1',
        });
      }
    }
  }

  private checkHeadings(html: string): void {
    const headingRegex = /<h([1-6])[^>]*>.*?<\/h\1>/gi;
    const levels: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(html)) !== null) {
      levels.push(Number(match[1]));
    }
    for (let i = 1; i < levels.length; i++) {
      if (levels[i]! > levels[i - 1]! + 1) {
        this.issues.push({
          id: 'a11y-heading-order',
          severity: 'warning',
          rule: 'heading-order',
          message: `Heading h${levels[i]} skips level (previous was h${levels[i - 1]})`,
          wcagReference: 'WCAG 1.3.1',
        });
      }
    }
  }

  private checkForms(html: string): void {
    const inputRegex = /<input\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = inputRegex.exec(html)) !== null) {
      const tag = match[0];
      const hasLabel = /id\s*=\s*["'][^"']+["']/i.test(tag);
      const hasAriaLabel = /aria-label\s*=/i.test(tag);
      if (!hasLabel && !hasAriaLabel) {
        this.issues.push({
          id: 'a11y-input-label',
          severity: 'error',
          rule: 'input-label',
          message: 'Input missing label or aria-label',
          element: tag,
          wcagReference: 'WCAG 1.3.1',
        });
      }
    }
  }

  private checkLinks(html: string): void {
    const linkRegex = /<a\b[^>]*>(.*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const content = match[1]?.trim() ?? '';
      if (!content || /^(click here|here|more|read more)$/i.test(content)) {
        this.issues.push({
          id: 'a11y-link-text',
          severity: 'warning',
          rule: 'link-text',
          message: `Link has non-descriptive text: "${content}"`,
          element: match[0],
          wcagReference: 'WCAG 2.4.4',
        });
      }
    }
  }
}
```

- [ ] **Step 6: Create src/aria-validator.ts**

```typescript
import type { AriaValidationResult, AriaError } from './types.js';

const VALID_ARIA_ROLES = [
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'dialog',
  'directory',
  'document',
  'feed',
  'figure',
  'form',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
] as const;

export class AriaValidator {
  validate(html: string): AriaValidationResult {
    const errors: AriaError[] = [];
    errors.push(...this.validateRoles(html));
    errors.push(...this.validateAriaAttributes(html));
    return { valid: errors.length === 0, errors };
  }

  private validateRoles(html: string): AriaError[] {
    const errors: AriaError[] = [];
    const roleRegex = /role\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = roleRegex.exec(html)) !== null) {
      const role = match[1]!.toLowerCase();
      if (!(VALID_ARIA_ROLES as readonly string[]).includes(role)) {
        errors.push({
          element: match[0],
          attribute: 'role',
          message: `Invalid ARIA role: "${role}"`,
        });
      }
    }
    return errors;
  }

  private validateAriaAttributes(html: string): AriaError[] {
    const errors: AriaError[] = [];
    const ariaRegex = /aria-([a-z]+)\s*=/gi;
    let match: RegExpExecArray | null;
    while ((match = ariaRegex.exec(html)) !== null) {
      const attr = `aria-${match[1]}`;
      if (attr === 'aria-') {
        errors.push({
          element: match[0],
          attribute: attr,
          message: 'Empty ARIA attribute name',
        });
      }
    }
    return errors;
  }
}
```

- [ ] **Step 7: Create src/color-contrast.ts**

```typescript
import type { ColorContrastResult } from './types.js';

export class ColorContrastAnalyzer {
  analyze(foreground: string, background: string): ColorContrastResult {
    const fgLuminance = this.getLuminance(this.parseColor(foreground));
    const bgLuminance = this.getLuminance(this.parseColor(background));
    const lighter = Math.max(fgLuminance, bgLuminance);
    const darker = Math.min(fgLuminance, bgLuminance);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    return {
      ratio: Math.round(ratio * 100) / 100,
      meetsAA: ratio >= 4.5,
      meetsAAA: ratio >= 7,
      foreground,
      background,
    };
  }

  private parseColor(color: string): [number, number, number] {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      return [
        parseInt(hex[0]! + hex[0]!, 16),
        parseInt(hex[1]! + hex[1]!, 16),
        parseInt(hex[2]! + hex[2]!, 16),
      ];
    }
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16),
    ];
  }

  private getLuminance([r, g, b]: [number, number, number]): number {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      const srgb = c / 255;
      return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
  }
}
```

- [ ] **Step 8: Create src/screen-reader.ts**

```typescript
export class ScreenReaderHelper {
  generateAriaLabel(element: string, context?: string): string {
    const parts: string[] = [];
    if (context) parts.push(context);
    const textContent = this.extractText(element);
    if (textContent) parts.push(textContent);
    const role = this.extractAttribute(element, 'role');
    if (role) parts.push(`(${role})`);
    return parts.join(' ') || 'Interactive element';
  }

  private extractText(element: string): string {
    const match = element.match(/>([^<]+)</);
    return match?.[1]?.trim() ?? '';
  }

  private extractAttribute(element: string, attr: string): string {
    const regex = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
    const match = element.match(regex);
    return match?.[1] ?? '';
  }
}
```

- [ ] **Step 9: Create src/index.ts**

```typescript
export { AccessibilityChecker } from './checker.js';
export { AriaValidator } from './aria-validator.js';
export { ColorContrastAnalyzer } from './color-contrast.js';
export { ScreenReaderHelper } from './screen-reader.js';
export type {
  AccessibilityCheckResult,
  AccessibilityIssue,
  ColorContrastResult,
  AriaValidationResult,
  AriaError,
} from './types.js';
```

- [ ] **Step 10: Create src/**tests**/checker.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { AccessibilityChecker } from '../checker.js';

describe('AccessibilityChecker', () => {
  const checker = new AccessibilityChecker();

  it('should pass for accessible HTML', () => {
    const html = '<img alt="Logo" src="logo.png"><h1>Title</h1>';
    const result = checker.check(html);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(80);
  });

  it('should fail for images without alt', () => {
    const html = '<img src="photo.png">';
    const result = checker.check(html);
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.rule).toBe('image-alt');
  });

  it('should warn for skipped heading levels', () => {
    const html = '<h1>Title</h1><h3>Subtitle</h3>';
    const result = checker.check(html);
    expect(result.issues.some((i) => i.rule === 'heading-order')).toBe(true);
  });

  it('should fail for inputs without labels', () => {
    const html = '<input type="text">';
    const result = checker.check(html);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.rule === 'input-label')).toBe(true);
  });

  it('should warn for non-descriptive link text', () => {
    const html = '<a href="/page">Click here</a>';
    const result = checker.check(html);
    expect(result.issues.some((i) => i.rule === 'link-text')).toBe(true);
  });
});
```

- [ ] **Step 11: Create README.md**

```markdown
# @ghita/a11y

Accessibility utilities for GHITA CODING AGENT.

## Features

- **AccessibilityChecker** — HTML accessibility validation
- **AriaValidator** — ARIA role and attribute validation
- **ColorContrastAnalyzer** — WCAG color contrast ratio checking
- **ScreenReaderHelper** — Screen reader label generation

## Usage

\`\`\`typescript
import { AccessibilityChecker, ColorContrastAnalyzer } from '@ghita/a11y';

const checker = new AccessibilityChecker();
const result = checker.check('<img src="photo.png">');
console.log(result.passed); // false
console.log(result.issues); // [{ rule: 'image-alt', ... }]
\`\`\`
```

- [ ] **Step 12: Add path alias to tsconfig.base.json**

Add to `compilerOptions.paths`:

```json
"@ghita/a11y": ["packages/a11y/src/index.ts"]
```

- [ ] **Step 13: Install dependencies and verify build**

```bash
cd "D:\GHITA CODING AGENT"
pnpm install
pnpm --filter @ghita/a11y build
pnpm --filter @ghita/a11y test
```

- [ ] **Step 14: Commit**

```bash
git add packages/a11y/ tsconfig.base.json
git commit -m "feat(a11y): implement accessibility checker package"
```

---

### Task 1.2: Create `@ghita/i18n` Package

**Files:**

- Create: `packages/i18n/package.json`
- Create: `packages/i18n/tsconfig.json`
- Create: `packages/i18n/vitest.config.ts`
- Create: `packages/i18n/src/types.ts`
- Create: `packages/i18n/src/manager.ts`
- Create: `packages/i18n/src/loader.ts`
- Create: `packages/i18n/src/detector.ts`
- Create: `packages/i18n/src/formatter.ts`
- Create: `packages/i18n/src/index.ts`
- Create: `packages/i18n/src/__tests__/manager.test.ts`
- Create: `packages/i18n/README.md`
- Modify: `tsconfig.base.json` — add path alias

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@ghita/i18n",
  "version": "0.0.4",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist tsconfig.tsbuildinfo"
  },
  "dependencies": {
    "@ghita/shared": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/index.ts'],
    },
  },
});
```

- [ ] **Step 4: Create src/types.ts**

```typescript
export type Locale = string; // e.g., 'en', 'vi', 'zh-CN'

export interface TranslationMessages {
  readonly [key: string]: string | TranslationMessages;
}

export interface I18nConfig {
  readonly defaultLocale: Locale;
  readonly fallbackLocale: Locale;
  readonly supportedLocales: readonly Locale[];
}

export interface FormatMessageOptions {
  readonly id: string;
  readonly defaultMessage?: string;
  readonly values?: Record<string, string | number>;
}
```

- [ ] **Step 5: Create src/manager.ts**

```typescript
import type { Locale, TranslationMessages, I18nConfig, FormatMessageOptions } from './types.js';

export class I18nManager {
  private currentLocale: Locale;
  private readonly translations = new Map<Locale, TranslationMessages>();
  private readonly config: I18nConfig;

  constructor(config: I18nConfig) {
    this.config = config;
    this.currentLocale = config.defaultLocale;
  }

  getLocale(): Locale {
    return this.currentLocale;
  }

  setLocale(locale: Locale): void {
    if (!this.config.supportedLocales.includes(locale)) {
      throw new Error(`Unsupported locale: ${locale}`);
    }
    this.currentLocale = locale;
  }

  addTranslations(locale: Locale, messages: TranslationMessages): void {
    const existing = this.translations.get(locale) ?? {};
    this.translations.set(locale, this.deepMerge(existing, messages));
  }

  formatMessage(options: FormatMessageOptions): string {
    const translation =
      this.resolve(options.id, this.currentLocale) ??
      this.resolve(options.id, this.config.fallbackLocale) ??
      options.defaultMessage ??
      options.id;

    if (!options.values) return translation;
    return this.interpolate(translation, options.values);
  }

  private resolve(id: string, locale: Locale): string | undefined {
    const messages = this.translations.get(locale);
    if (!messages) return undefined;
    const keys = id.split('.');
    let current: string | TranslationMessages = messages;
    for (const key of keys) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as TranslationMessages)[key]!;
      if (current === undefined) return undefined;
    }
    return typeof current === 'string' ? current : undefined;
  }

  private interpolate(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const val = values[key];
      return val !== undefined ? String(val) : `{${key}}`;
    });
  }

  private deepMerge(target: TranslationMessages, source: TranslationMessages): TranslationMessages {
    const result: Record<string, string | TranslationMessages> = { ...target };
    for (const key of Object.keys(source)) {
      const tVal = target[key];
      const sVal = source[key];
      if (typeof tVal === 'object' && typeof sVal === 'object') {
        result[key] = this.deepMerge(tVal as TranslationMessages, sVal as TranslationMessages);
      } else {
        result[key] = sVal as string | TranslationMessages;
      }
    }
    return result;
  }
}
```

- [ ] **Step 6: Create src/loader.ts**

```typescript
import type { Locale, TranslationMessages } from './types.js';

export type TranslationLoader = (locale: Locale) => Promise<TranslationMessages>;

export class TranslationLoaderRegistry {
  private readonly loaders = new Map<Locale, TranslationLoader>();

  register(locale: Locale, loader: TranslationLoader): void {
    this.loaders.set(locale, loader);
  }

  async load(locale: Locale): Promise<TranslationMessages> {
    const loader = this.loaders.get(locale);
    if (!loader) throw new Error(`No loader registered for locale: ${locale}`);
    return loader(locale);
  }

  has(locale: Locale): boolean {
    return this.loaders.has(locale);
  }
}
```

- [ ] **Step 7: Create src/detector.ts**

```typescript
import type { Locale } from './types.js';

export class LocaleDetector {
  detect(
    acceptLanguage: string | undefined,
    supportedLocales: readonly Locale[],
  ): Locale | undefined {
    if (!acceptLanguage) return undefined;
    const parsed = this.parseAcceptLanguage(acceptLanguage);
    for (const { locale } of parsed) {
      const match = this.findMatch(locale, supportedLocales);
      if (match) return match;
    }
    return undefined;
  }

  private parseAcceptLanguage(header: string): Array<{ locale: string; quality: number }> {
    return header
      .split(',')
      .map((part) => {
        const [locale, q] = part.trim().split(';q=');
        return {
          locale: locale!.trim(),
          quality: q ? parseFloat(q) : 1,
        };
      })
      .sort((a, b) => b.quality - a.quality);
  }

  private findMatch(locale: string, supported: readonly Locale[]): Locale | undefined {
    const normalized = locale.toLowerCase();
    for (const s of supported) {
      if (s.toLowerCase() === normalized) return s;
      if (s.toLowerCase().startsWith(normalized + '-')) return s;
      if (normalized.startsWith(s.toLowerCase() + '-')) return s;
    }
    return undefined;
  }
}
```

- [ ] **Step 8: Create src/formatter.ts**

```typescript
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(
  value: Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function formatCurrency(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

export function formatPlural(count: number, locale: string, forms: Record<string, string>): string {
  const pr = new Intl.PluralRules(locale);
  const rule = pr.select(count);
  return forms[rule] ?? forms['other'] ?? '';
}
```

- [ ] **Step 9: Create src/index.ts**

```typescript
export { I18nManager } from './manager.js';
export { TranslationLoaderRegistry } from './loader.js';
export type { TranslationLoader } from './loader.js';
export { LocaleDetector } from './detector.js';
export { formatNumber, formatDate, formatCurrency, formatPlural } from './formatter.js';
export type { Locale, TranslationMessages, I18nConfig, FormatMessageOptions } from './types.js';
```

- [ ] **Step 10: Create src/**tests**/manager.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { I18nManager } from '../manager.js';

describe('I18nManager', () => {
  const config = {
    defaultLocale: 'en',
    fallbackLocale: 'en',
    supportedLocales: ['en', 'vi'],
  };

  it('should return message by id', () => {
    const manager = new I18nManager(config);
    manager.addTranslations('en', { hello: 'Hello' });
    expect(manager.formatMessage({ id: 'hello' })).toBe('Hello');
  });

  it('should interpolate values', () => {
    const manager = new I18nManager(config);
    manager.addTranslations('en', { greeting: 'Hello, {name}!' });
    expect(manager.formatMessage({ id: 'greeting', values: { name: 'World' } })).toBe(
      'Hello, World!',
    );
  });

  it('should fall back to fallback locale', () => {
    const manager = new I18nManager(config);
    manager.addTranslations('en', { hello: 'Hello' });
    manager.setLocale('vi');
    expect(manager.formatMessage({ id: 'hello' })).toBe('Hello');
  });

  it('should return id if no translation found', () => {
    const manager = new I18nManager(config);
    expect(manager.formatMessage({ id: 'missing' })).toBe('missing');
  });

  it('should support nested keys', () => {
    const manager = new I18nManager(config);
    manager.addTranslations('en', { nav: { home: 'Home', about: 'About' } });
    expect(manager.formatMessage({ id: 'nav.home' })).toBe('Home');
  });

  it('should throw for unsupported locale', () => {
    const manager = new I18nManager(config);
    expect(() => manager.setLocale('fr')).toThrow('Unsupported locale: fr');
  });
});
```

- [ ] **Step 11: Create README.md**

```markdown
# @ghita/i18n

Internationalization engine for GHITA CODING AGENT.

## Features

- **I18nManager** — Translation management with nested keys and interpolation
- **TranslationLoaderRegistry** — Lazy-loading translation files
- **LocaleDetector** — Accept-Language header parsing
- **formatNumber/formatDate/formatCurrency** — ICU formatting utilities

## Usage

\`\`\`typescript
import { I18nManager } from '@ghita/i18n';

const i18n = new I18nManager({
defaultLocale: 'en',
fallbackLocale: 'en',
supportedLocales: ['en', 'vi'],
});

i18n.addTranslations('en', { hello: 'Hello, {name}!' });
i18n.formatMessage({ id: 'hello', values: { name: 'World' } }); // "Hello, World!"
\`\`\`
```

- [ ] **Step 12: Add path alias to tsconfig.base.json**

Add to `compilerOptions.paths`:

```json
"@ghita/i18n": ["packages/i18n/src/index.ts"]
```

- [ ] **Step 13: Install dependencies and verify**

```bash
pnpm install
pnpm --filter @ghita/i18n build
pnpm --filter @ghita/i18n test
```

- [ ] **Step 14: Commit**

```bash
git add packages/i18n/ tsconfig.base.json
git commit -m "feat(i18n): implement internationalization engine package"
```

---

### Task 1.3: Create `@ghita/migration` Package

**Files:**

- Create: `packages/migration/package.json`
- Create: `packages/migration/tsconfig.json`
- Create: `packages/migration/vitest.config.ts`
- Create: `packages/migration/src/types.ts`
- Create: `packages/migration/src/runner.ts`
- Create: `packages/migration/src/registry.ts`
- Create: `packages/migration/src/version-detector.ts`
- Create: `packages/migration/src/index.ts`
- Create: `packages/migration/src/__tests__/runner.test.ts`
- Create: `packages/migration/README.md`
- Modify: `tsconfig.base.json` — add path alias

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@ghita/migration",
  "version": "0.0.4",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist tsconfig.tsbuildinfo"
  },
  "dependencies": {
    "@ghita/shared": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/index.ts'],
    },
  },
});
```

- [ ] **Step 4: Create src/types.ts**

```typescript
export interface Migration {
  readonly version: string;
  readonly name: string;
  up(): Promise<void>;
  down(): Promise<void>;
}

export interface MigrationState {
  readonly currentVersion: string;
  readonly appliedMigrations: readonly string[];
  readonly lastRunAt: string | null;
}

export interface MigrationRunnerConfig {
  readonly stateFile: string;
}
```

- [ ] **Step 5: Create src/runner.ts**

```typescript
import type { Migration, MigrationState, MigrationRunnerConfig } from './types.js';

export class MigrationRunner {
  private state: MigrationState;
  private readonly config: MigrationRunnerConfig;

  constructor(config: MigrationRunnerConfig, initialState?: MigrationState) {
    this.config = config;
    this.state = initialState ?? {
      currentVersion: '0.0.0',
      appliedMigrations: [],
      lastRunAt: null,
    };
  }

  getState(): MigrationState {
    return { ...this.state };
  }

  async runUp(migrations: readonly Migration[]): Promise<string[]> {
    const applied: string[] = [];
    const sorted = [...migrations].sort((a, b) => a.version.localeCompare(b.version));
    for (const migration of sorted) {
      if (this.state.appliedMigrations.includes(migration.name)) continue;
      await migration.up();
      this.state = {
        currentVersion: migration.version,
        appliedMigrations: [...this.state.appliedMigrations, migration.name],
        lastRunAt: new Date().toISOString(),
      };
      applied.push(migration.name);
    }
    return applied;
  }

  async runDown(migrations: readonly Migration[], count = 1): Promise<string[]> {
    const rolledBack: string[] = [];
    const sorted = [...migrations]
      .sort((a, b) => b.version.localeCompare(a.version))
      .filter((m) => this.state.appliedMigrations.includes(m.name));
    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      const migration = sorted[i]!;
      await migration.down();
      this.state = {
        currentVersion: i + 1 < sorted.length ? sorted[i + 1]!.version : '0.0.0',
        appliedMigrations: this.state.appliedMigrations.filter((n) => n !== migration.name),
        lastRunAt: new Date().toISOString(),
      };
      rolledBack.push(migration.name);
    }
    return rolledBack;
  }
}
```

- [ ] **Step 6: Create src/registry.ts**

```typescript
import type { Migration } from './types.js';

export class MigrationRegistry {
  private readonly migrations = new Map<string, Migration>();

  register(migration: Migration): void {
    if (this.migrations.has(migration.name)) {
      throw new Error(`Migration already registered: ${migration.name}`);
    }
    this.migrations.set(migration.name, migration);
  }

  getAll(): readonly Migration[] {
    return [...this.migrations.values()].sort((a, b) => a.version.localeCompare(b.version));
  }

  getByName(name: string): Migration | undefined {
    return this.migrations.get(name);
  }

  getByVersion(version: string): Migration | undefined {
    return [...this.migrations.values()].find((m) => m.version === version);
  }
}
```

- [ ] **Step 7: Create src/version-detector.ts**

```typescript
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const maxLen = Math.max(pa.length, pb.length);
  for (let i = 0; i < maxLen; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
}
```

- [ ] **Step 8: Create src/index.ts**

```typescript
export { MigrationRunner } from './runner.js';
export { MigrationRegistry } from './registry.js';
export { compareVersions, isValidVersion } from './version-detector.js';
export type { Migration, MigrationState, MigrationRunnerConfig } from './types.js';
```

- [ ] **Step 9: Create src/**tests**/runner.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { MigrationRunner } from '../runner.js';
import type { Migration } from '../types.js';

function createMockMigration(name: string, version: string): Migration {
  return {
    name,
    version,
    up: async () => {},
    down: async () => {},
  };
}

describe('MigrationRunner', () => {
  it('should run migrations in order', async () => {
    const runner = new MigrationRunner({ stateFile: '/tmp/state.json' });
    const migrations = [
      createMockMigration('create-users', '0.0.2'),
      createMockMigration('create-posts', '0.0.1'),
    ];
    const applied = await runner.runUp(migrations);
    expect(applied).toEqual(['create-posts', 'create-users']);
    expect(runner.getState().currentVersion).toBe('0.0.2');
  });

  it('should skip already applied migrations', async () => {
    const runner = new MigrationRunner(
      { stateFile: '/tmp/state.json' },
      { currentVersion: '0.0.1', appliedMigrations: ['create-posts'], lastRunAt: null },
    );
    const migrations = [
      createMockMigration('create-posts', '0.0.1'),
      createMockMigration('create-users', '0.0.2'),
    ];
    const applied = await runner.runUp(migrations);
    expect(applied).toEqual(['create-users']);
  });

  it('should rollback migrations', async () => {
    const runner = new MigrationRunner(
      { stateFile: '/tmp/state.json' },
      {
        currentVersion: '0.0.2',
        appliedMigrations: ['create-posts', 'create-users'],
        lastRunAt: null,
      },
    );
    const migrations = [
      createMockMigration('create-posts', '0.0.1'),
      createMockMigration('create-users', '0.0.2'),
    ];
    const rolledBack = await runner.runDown(migrations, 1);
    expect(rolledBack).toEqual(['create-users']);
    expect(runner.getState().currentVersion).toBe('0.0.1');
  });
});
```

- [ ] **Step 10: Create README.md**

```markdown
# @ghita/migration

Data migration framework for GHITA CODING AGENT.

## Features

- **MigrationRunner** — Run and rollback migrations with state tracking
- **MigrationRegistry** — Register and discover migrations
- **compareVersions** — Semantic version comparison

## Usage

\`\`\`typescript
import { MigrationRunner, MigrationRegistry } from '@ghita/migration';

const registry = new MigrationRegistry();
registry.register({
name: 'create-users',
version: '0.0.1',
up: async () => { /_ create table _/ },
down: async () => { /_ drop table _/ },
});

const runner = new MigrationRunner({ stateFile: './migrations.json' });
await runner.runUp(registry.getAll());
\`\`\`
```

- [ ] **Step 11: Add path alias and verify**

Add to `tsconfig.base.json` paths:

```json
"@ghita/migration": ["packages/migration/src/index.ts"]
```

```bash
pnpm install
pnpm --filter @ghita/migration build
pnpm --filter @ghita/migration test
git add packages/migration/ tsconfig.base.json
git commit -m "feat(migration): implement data migration framework package"
```

---

### Task 1.4: Create `@ghita/mobile-companion` Package

**Files:**

- Create: `packages/mobile-companion/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/mobile-companion/src/types.ts`, `bluetooth.ts`, `network-discovery.ts`, `push-bridge.ts`, `device-capabilities.ts`, `index.ts`
- Create: `packages/mobile-companion/src/__tests__/bluetooth.test.ts`
- Create: `packages/mobile-companion/README.md`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create package.json, tsconfig.json, vitest.config.ts**

Use same pattern as Task 1.1, with dependencies: `@ghita/shared`, `@ghita/communication`.

- [ ] **Step 2: Create src/types.ts**

```typescript
export interface BluetoothDevice {
  readonly id: string;
  readonly name: string;
  readonly rssi: number;
  readonly paired: boolean;
}

export interface NetworkDevice {
  readonly ip: string;
  readonly port: number;
  readonly name: string;
  readonly type: 'desktop' | 'mobile';
}

export interface PushNotification {
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, string>;
  readonly priority: 'low' | 'normal' | 'high';
}

export interface DeviceCapabilities {
  readonly hasBluetooth: boolean;
  readonly hasCamera: boolean;
  readonly hasGPS: boolean;
  readonly hasAccelerometer: boolean;
  readonly screenSize: { width: number; height: number };
  readonly os: string;
  readonly osVersion: string;
}
```

- [ ] **Step 3: Create src/bluetooth.ts**

```typescript
import type { BluetoothDevice } from './types.js';

export class BluetoothPairing {
  private readonly discoveredDevices = new Map<string, BluetoothDevice>();
  private readonly pairedDevices = new Set<string>();

  async scan(timeoutMs = 5000): Promise<readonly BluetoothDevice[]> {
    // In real implementation, this would use native Bluetooth APIs
    // For now, return discovered devices from internal state
    return [...this.discoveredDevices.values()];
  }

  async pair(deviceId: string, pin: string): Promise<boolean> {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be 6 digits');
    }
    this.pairedDevices.add(deviceId);
    return true;
  }

  async unpair(deviceId: string): Promise<void> {
    this.pairedDevices.delete(deviceId);
  }

  isPaired(deviceId: string): boolean {
    return this.pairedDevices.has(deviceId);
  }

  getPairedDevices(): readonly string[] {
    return [...this.pairedDevices];
  }
}
```

- [ ] **Step 4: Create src/network-discovery.ts**

```typescript
import type { NetworkDevice } from './types.js';

export class NetworkDiscovery {
  private readonly devices = new Map<string, NetworkDevice>();

  async discover(port: number): Promise<readonly NetworkDevice[]> {
    // Real implementation would use mDNS/SSDP
    return [...this.devices.values()].filter((d) => d.port === port);
  }

  registerDevice(device: NetworkDevice): void {
    this.devices.set(device.ip, device);
  }

  removeDevice(ip: string): void {
    this.devices.delete(ip);
  }
}
```

- [ ] **Step 5: Create src/push-bridge.ts**

```typescript
import type { PushNotification } from './types.js';

export class PushNotificationBridge {
  private readonly queue: PushNotification[] = [];

  enqueue(notification: PushNotification): void {
    this.queue.push(notification);
  }

  dequeue(): PushNotification | undefined {
    return this.queue.shift();
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.length = 0;
  }
}
```

- [ ] **Step 6: Create src/device-capabilities.ts**

```typescript
import type { DeviceCapabilities } from './types.js';

export function detectCapabilities(
  userAgent: string,
  screenSize?: { width: number; height: number },
): DeviceCapabilities {
  const isAndroid = /android/i.test(userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(userAgent);
  return {
    hasBluetooth: isAndroid || isIOS,
    hasCamera: true,
    hasGPS: isAndroid || isIOS,
    hasAccelerometer: isAndroid || isIOS,
    screenSize: screenSize ?? { width: 360, height: 640 },
    os: isAndroid ? 'android' : isIOS ? 'ios' : 'unknown',
    osVersion: extractOSVersion(userAgent),
  };
}

function extractOSVersion(userAgent: string): string {
  const androidMatch = userAgent.match(/android\s([\d.]+)/i);
  if (androidMatch) return androidMatch[1]!;
  const iosMatch = userAgent.match(/os\s([\d_]+)/i);
  if (iosMatch) return iosMatch[1]!.replace(/_/g, '.');
  return 'unknown';
}
```

- [ ] **Step 7: Create src/index.ts**

```typescript
export { BluetoothPairing } from './bluetooth.js';
export { NetworkDiscovery } from './network-discovery.js';
export { PushNotificationBridge } from './push-bridge.js';
export { detectCapabilities } from './device-capabilities.js';
export type {
  BluetoothDevice,
  NetworkDevice,
  PushNotification,
  DeviceCapabilities,
} from './types.js';
```

- [ ] **Step 8: Create tests and README, add path alias, verify, commit**

Follow same pattern as Task 1.1 steps 10-14.

---

### Task 1.5: Create `@ghita/integration` Package

**Files:**

- Create: `packages/integration/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/integration/src/types.ts`, `core.ts`, `event-bus.ts`, `service-registry.ts`, `health-check.ts`, `index.ts`
- Create: `packages/integration/src/__tests__/core.test.ts`
- Create: `packages/integration/README.md`
- Modify: `tsconfig.base.json`

- [ ] **Step 1-3: Create package scaffolding**

Same pattern as Task 1.1. Dependencies: `@ghita/shared` only.

- [ ] **Step 4: Create src/types.ts**

```typescript
export interface ServiceHealth {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latencyMs: number;
  readonly details?: Record<string, unknown>;
}

export interface EventHandler<T = unknown> {
  (event: T): void | Promise<void>;
}

export interface ServiceDefinition {
  readonly name: string;
  readonly version: string;
  readonly healthCheck?: () => Promise<ServiceHealth>;
}
```

- [ ] **Step 5: Create src/event-bus.ts**

```typescript
import type { EventHandler } from './types.js';

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.off(event, handler);
  }

  off<T>(event: string, handler: EventHandler<T>): void {
    this.handlers.get(event)?.delete(handler as EventHandler);
  }

  async emit<T>(event: string, data: T): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    const promises = [...handlers].map((h) => h(data));
    await Promise.allSettled(promises);
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
```

- [ ] **Step 6: Create src/service-registry.ts**

```typescript
import type { ServiceDefinition, ServiceHealth } from './types.js';

export class ServiceRegistry {
  private readonly services = new Map<string, ServiceDefinition>();

  register(service: ServiceDefinition): void {
    this.services.set(service.name, service);
  }

  unregister(name: string): void {
    this.services.delete(name);
  }

  get(name: string): ServiceDefinition | undefined {
    return this.services.get(name);
  }

  getAll(): readonly ServiceDefinition[] {
    return [...this.services.values()];
  }

  async checkHealth(name: string): Promise<ServiceHealth> {
    const service = this.services.get(name);
    if (!service) {
      return { name, status: 'unhealthy', latencyMs: 0, details: { error: 'Not found' } };
    }
    if (!service.healthCheck) {
      return { name, status: 'healthy', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      const result = await service.healthCheck();
      return { ...result, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        details: { error: String(error) },
      };
    }
  }

  async checkAll(): Promise<readonly ServiceHealth[]> {
    const promises = [...this.services.keys()].map((name) => this.checkHealth(name));
    return Promise.all(promises);
  }
}
```

- [ ] **Step 7: Create src/health-check.ts**

```typescript
import type { ServiceHealth } from './types.js';

export class HealthCheckAggregator {
  private readonly checks = new Map<string, () => Promise<ServiceHealth>>();

  register(name: string, check: () => Promise<ServiceHealth>): void {
    this.checks.set(name, check);
  }

  async runAll(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: readonly ServiceHealth[];
  }> {
    const results: ServiceHealth[] = [];
    for (const [name, check] of this.checks) {
      try {
        results.push(await check());
      } catch {
        results.push({ name, status: 'unhealthy', latencyMs: 0 });
      }
    }
    const hasUnhealthy = results.some((r) => r.status === 'unhealthy');
    const hasDegraded = results.some((r) => r.status === 'degraded');
    return {
      overall: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
      services: results,
    };
  }
}
```

- [ ] **Step 8: Create src/core.ts**

```typescript
import { EventBus } from './event-bus.js';
import { ServiceRegistry } from './service-registry.js';
import { HealthCheckAggregator } from './health-check.js';

export class GhitaCore {
  readonly events: EventBus;
  readonly services: ServiceRegistry;
  readonly health: HealthCheckAggregator;

  constructor() {
    this.events = new EventBus();
    this.services = new ServiceRegistry();
    this.health = new HealthCheckAggregator();
  }

  async shutdown(): Promise<void> {
    this.events.removeAllListeners();
  }
}
```

- [ ] **Step 9: Create src/index.ts**

```typescript
export { GhitaCore } from './core.js';
export { EventBus } from './event-bus.js';
export { ServiceRegistry } from './service-registry.js';
export { HealthCheckAggregator } from './health-check.js';
export type { ServiceHealth, EventHandler, ServiceDefinition } from './types.js';
```

- [ ] **Step 10-14: Tests, README, path alias, verify, commit**

Follow same pattern as Task 1.1.

---

### Task 1.6: Create `@ghita/relay-server` Package

**Files:**

- Create: `packages/relay-server/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/relay-server/src/types.ts`, `server.ts`, `room-manager.ts`, `connection-broker.ts`, `rate-limiter.ts`, `index.ts`
- Create: `packages/relay-server/src/__tests__/server.test.ts`
- Create: `packages/relay-server/README.md`
- Modify: `tsconfig.base.json`

- [ ] **Step 1-3: Create package scaffolding**

Same pattern. Dependencies: `@ghita/shared`, `@ghita/communication`, `@ghita/security`.

- [ ] **Step 4: Create src/types.ts**

```typescript
export interface RelayConfig {
  readonly port: number;
  readonly maxRooms: number;
  readonly maxConnectionsPerRoom: number;
  readonly pingIntervalMs: number;
}

export interface RelayRoom {
  readonly id: string;
  readonly createdAt: string;
  readonly connections: readonly string[];
}

export interface RelayMessage {
  readonly from: string;
  readonly to: string | '*';
  readonly type: string;
  readonly payload: unknown;
}
```

- [ ] **Step 5: Create src/rate-limiter.ts**

```typescript
export class RateLimiter {
  private readonly counts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(key);
    if (!entry || now > entry.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.maxRequests) return false;
    entry.count++;
    return true;
  }

  reset(key: string): void {
    this.counts.delete(key);
  }
}
```

- [ ] **Step 6: Create src/room-manager.ts**

```typescript
import type { RelayRoom } from './types.js';

export class RoomManager {
  private readonly rooms = new Map<string, RelayRoom>();

  constructor(private readonly maxRooms: number) {}

  createRoom(id: string): RelayRoom {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Maximum rooms reached');
    }
    const room: RelayRoom = { id, createdAt: new Date().toISOString(), connections: [] };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId: string, connectionId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room not found: ${roomId}`);
    if ((room as { connections: string[] }).connections.includes(connectionId)) return;
    (room as { connections: string[] }).connections.push(connectionId);
  }

  leaveRoom(roomId: string, connectionId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    (room as { connections: string[] }).connections = (
      room as { connections: string[] }
    ).connections.filter((c: string) => c !== connectionId);
    if ((room as { connections: string[] }).connections.length === 0) {
      this.rooms.delete(roomId);
    }
  }

  getRoom(id: string): RelayRoom | undefined {
    return this.rooms.get(id);
  }
}
```

- [ ] **Step 7: Create src/connection-broker.ts**

```typescript
export class ConnectionBroker {
  private readonly connections = new Map<string, { connectedAt: number; roomId?: string }>();

  register(id: string): void {
    this.connections.set(id, { connectedAt: Date.now() });
  }

  unregister(id: string): void {
    this.connections.delete(id);
  }

  setRoom(id: string, roomId: string): void {
    const conn = this.connections.get(id);
    if (conn) conn.roomId = roomId;
  }

  getRoom(id: string): string | undefined {
    return this.connections.get(id)?.roomId;
  }

  count(): number {
    return this.connections.size;
  }
}
```

- [ ] **Step 8: Create src/server.ts**

```typescript
import type { RelayConfig, RelayMessage } from './types.js';
import { RoomManager } from './room-manager.js';
import { ConnectionBroker } from './connection-broker.js';
import { RateLimiter } from './rate-limiter.js';

export class RelayServer {
  readonly rooms: RoomManager;
  readonly connections: ConnectionBroker;
  readonly rateLimiter: RateLimiter;
  private readonly config: RelayConfig;

  constructor(config: RelayConfig) {
    this.config = config;
    this.rooms = new RoomManager(config.maxRooms);
    this.connections = new ConnectionBroker();
    this.rateLimiter = new RateLimiter(100, 60_000);
  }

  getConfig(): RelayConfig {
    return { ...this.config };
  }

  handleMessage(message: RelayMessage): RelayMessage | null {
    if (!this.rateLimiter.check(message.from)) return null;
    if (message.to === '*') return message;
    return message;
  }
}
```

- [ ] **Step 9: Create src/index.ts**

```typescript
export { RelayServer } from './server.js';
export { RoomManager } from './room-manager.js';
export { ConnectionBroker } from './connection-broker.js';
export { RateLimiter } from './rate-limiter.js';
export type { RelayConfig, RelayRoom, RelayMessage } from './types.js';
```

- [ ] **Step 10-14: Tests, README, path alias, verify, commit**

Follow same pattern as Task 1.1.

---

### Task 1.7: Write Architecture Decision Records (ADRs)

**Files:**

- Create: `docs/adr/001-monorepo-pnpm-turborepo.md`
- Create: `docs/adr/002-tauri-v2-desktop.md`
- Create: `docs/adr/003-adapter-pattern-over-di.md`
- Create: `docs/adr/004-zustand-state-management.md`
- Create: `docs/adr/005-socket-io-communication.md`
- Create: `docs/adr/006-aes-256-gcm-encryption.md`
- Create: `docs/adr/007-vitest-test-runner.md`
- Create: `docs/adr/008-parallel-streams-improvement.md`

- [ ] **Step 1: Create ADR template**

```markdown
# ADR-{NUMBER}: {TITLE}

**Status:** Accepted
**Date:** {DATE}
**Deciders:** GHITA Team

## Context

{What is the issue that we're seeing that is motivating this decision or change?}

## Decision

{What is the change that we're proposing and/or doing?}

## Consequences

{What becomes easier or more difficult to do because of this change?}
```

- [ ] **Step 2: Create all 8 ADRs**

Each ADR fills the template with the actual decision context from the project. Example for ADR-001:

```markdown
# ADR-001: Monorepo with pnpm + Turborepo

**Status:** Accepted
**Date:** 2026-05-19
**Deciders:** GHITA Team

## Context

GHITA CODING AGENT consists of multiple packages (ai-engine, agents, skills, communication, etc.) and apps (desktop, mobile, vscode-extension). These share common types and utilities. Managing separate repositories would create coordination overhead and version drift.

## Decision

Use pnpm workspaces with Turborepo for monorepo orchestration:

- pnpm for dependency management (fast, disk-efficient, strict)
- Turborepo for build orchestration (caching, parallel execution, task dependencies)
- 22 internal packages under `packages/`
- 3 apps under `apps/`

## Consequences

**Positive:**

- Single install command for all packages
- Shared types via `@ghita/shared` without publishing
- Turborepo caching reduces build times
- Atomic commits across packages

**Negative:**

- Larger repository size
- Requires understanding of monorepo tooling
- CI needs to handle all packages
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/
git commit -m "docs: add architecture decision records for key design decisions"
```

---

### Task 1.8: Wire Commitlint Hook

**Files:**

- Create: `.husky/commit-msg`
- Modify: `package.json` (add `commitlint` to devDependencies if not present)

- [ ] **Step 1: Create .husky/commit-msg**

```bash
npx --no -- commitlint --edit $1
```

- [ ] **Step 2: Verify commitlint is in devDependencies**

Check `package.json` has `@commitlint/cli` and `@commitlint/config-conventional`. If not, add them.

- [ ] **Step 3: Test the hook**

```bash
git commit -m "bad commit message" # Should fail
git commit -m "fix: correct commit message" # Should pass
```

- [ ] **Step 4: Commit**

```bash
git add .husky/commit-msg
git commit -m "chore: wire commitlint commit-msg hook for conventional commits"
```

---

## Stream 2: Testing

### Task 2.1: Add Visual Regression Tests

**Files:**

- Create: `tests/e2e/visual/visual-regression.spec.ts`
- Create: `tests/e2e/visual/playwright.config.ts`

- [ ] **Step 1: Create playwright config for visual tests**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30000,
  expect: {
    toHaveScreenshot: { maxDiffPixels: 100, threshold: 0.2 },
  },
  use: {
    baseURL: 'http://localhost:1420',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 2: Create visual regression test file**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('main layout renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('main-layout.png');
  });

  test('code editor renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const editor = page.locator('[data-testid="code-editor"]');
    if (await editor.isVisible()) {
      await expect(editor).toHaveScreenshot('code-editor.png');
    }
  });

  test('terminal renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const terminal = page.locator('[data-testid="terminal"]');
    if (await terminal.isVisible()) {
      await expect(terminal).toHaveScreenshot('terminal.png');
    }
  });
});
```

- [ ] **Step 3: Generate baseline screenshots**

```bash
npx playwright test tests/e2e/visual/ --update-snapshots
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/visual/
git commit -m "test: add Playwright visual regression tests for main UI components"
```

---

### Task 2.2: Add Mutation Testing with StrykerJS

**Files:**

- Create: `stryker.config.mjs`
- Create: `.github/workflows/mutation-testing.yml`

- [ ] **Step 1: Install StrykerJS**

```bash
pnpm add -Dw @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

- [ ] **Step 2: Create stryker.config.mjs**

```javascript
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  tsconfigFile: 'tsconfig.base.json',
  mutate: [
    'packages/security/src/**/*.ts',
    'packages/ai-engine/src/utils/security.ts',
    'packages/ai-engine/src/utils/crypto.ts',
    'packages/communication/src/utils/security.ts',
  ],
  thresholds: {
    high: 80,
    low: 70,
    break: 60,
  },
  vitest: {
    configFile: 'packages/security/vitest.config.ts',
  },
};
export default config;
```

- [ ] **Step 3: Create mutation testing workflow**

```yaml
name: Mutation Testing
on:
  pull_request:
    branches: [main]
    paths:
      - 'packages/security/**'
      - 'packages/ai-engine/src/utils/**'

jobs:
  mutation-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build:packages
      - run: pnpm exec stryker run
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: mutation-report
          path: reports/mutation/
```

- [ ] **Step 4: Run mutation tests locally**

```bash
pnpm exec stryker run
```

- [ ] **Step 5: Commit**

```bash
git add stryker.config.mjs .github/workflows/mutation-testing.yml package.json pnpm-lock.yaml
git commit -m "test: add StrykerJS mutation testing for security-critical code"
```

---

### Task 2.3: Expand Fuzz Testing

**Files:**

- Create: `tests/fuzz/expanded-fuzz.test.ts`

- [ ] **Step 1: Install fast-check**

```bash
pnpm add -Dw fast-check
```

- [ ] **Step 2: Create expanded fuzz test**

```typescript
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { InputSanitizer } from '@ghita/security';

describe('Fuzz: InputSanitizer', () => {
  const sanitizer = new InputSanitizer();

  it('escapeHtml should never throw on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.escapeHtml(input);
        expect(typeof result).toBe('string');
      }),
    );
  });

  it('escapeHtml should always escape < and >', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.escapeHtml(input);
        if (input.includes('<')) expect(result).not.toContain('<');
        if (input.includes('>')) expect(result).not.toContain('>');
      }),
    );
  });

  it('stripHtml should remove all tags', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.stripHtml(input);
        expect(result).not.toMatch(/<[^>]+>/);
      }),
    );
  });

  it('escapeShell should produce safe shell arguments', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizer.escapeShell(input);
        // Should not contain unescaped single quotes
        expect(result).not.toMatch(/(?<!\\)'/);
      }),
    );
  });
});
```

- [ ] **Step 3: Run fuzz tests**

```bash
pnpm exec vitest run tests/fuzz/expanded-fuzz.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add tests/fuzz/expanded-fuzz.test.ts package.json pnpm-lock.yaml
git commit -m "test: add property-based fuzz testing for InputSanitizer"
```

---

## Stream 3: Security

### Task 3.1: Create Penetration Testing Checklist

**Files:**

- Create: `docs/security/penetration-testing-checklist.md`

- [ ] **Step 1: Create the checklist document**

```markdown
# Penetration Testing Checklist — GHITA CODING AGENT

> **Version:** 1.0
> **Last Updated:** 2026-06-24

## 1. Input Validation

- [ ] XSS via chat messages
- [ ] XSS via skill names/descriptions
- [ ] SQL injection via search queries
- [ ] Command injection via terminal commands
- [ ] Path traversal via file operations
- [ ] SSRF via URL inputs (AI engine, browser control)
- [ ] DNS rebinding attacks on SSRF protection

## 2. Authentication & Authorization

- [ ] Pairing code brute force (6-digit PIN)
- [ ] Session fixation on Socket.IO connections
- [ ] Token leakage in error messages
- [ ] Privilege escalation via skill permissions
- [ ] IDOR on device/session identifiers

## 3. Communication Security

- [ ] MitM on Socket.IO (should use WSS in production)
- [ ] Replay attacks on pairing protocol
- [ ] Message tampering on relay server
- [ ] Rate limiting on connection attempts

## 4. Computer Use Security

- [ ] Sandbox escape via computer-use commands
- [ ] Unauthorized keyboard/mouse input
- [ ] Screen capture data leakage
- [ ] Browser automation privilege escalation

## 5. API Key Security

- [ ] Memory dump exposure
- [ ] Log file exposure
- [ ] Environment variable leakage
- [ ] Key rotation failure modes

## 6. Dependency Security

- [ ] Known CVEs in dependencies
- [ ] License compliance (GPL/AGPL)
- [ ] Typosquatting attacks
- [ ] Supply chain attacks

## 7. Infrastructure

- [ ] CSP bypass attempts
- [ ] CORS misconfiguration
- [ ] Docker container escape
- [ ] Tauri IPC privilege escalation
```

- [ ] **Step 2: Commit**

```bash
git add docs/security/
git commit -m "docs: add penetration testing checklist for security auditing"
```

---

### Task 3.2: CSP Hardening

**Files:**

- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add nonce generation)

- [ ] **Step 1: Add nonce generation in Rust backend**

Add to `apps/desktop/src-tauri/src/lib.rs`:

```rust
use rand::Rng;

fn generate_nonce() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    base64::encode(&bytes)
}
```

- [ ] **Step 2: Update CSP in tauri.conf.json**

Replace `style-src 'self' 'unsafe-inline'` with nonce-based CSP. This requires dynamic CSP injection at runtime via Tauri's `csp` hook.

- [ ] **Step 3: Test CSP**

Verify that inline styles still work with nonce, and that `'unsafe-inline'` is removed.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/
git commit -m "security: harden CSP by replacing unsafe-inline with nonce-based style-src"
```

---

### Task 3.3: Enhance Security CI Workflow

**Files:**

- Modify: `.github/workflows/security-scan.yml`

- [ ] **Step 1: Add semgrep job**

```yaml
semgrep-scan:
  runs-on: ubuntu-latest
  container:
    image: semgrep/semgrep
  steps:
    - uses: actions/checkout@v4
    - run: semgrep scan --config=auto --error --quiet
```

- [ ] **Step 2: Add gitleaks job**

```yaml
gitleaks-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: gitleaks/gitleaks-action@v2
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/security-scan.yml
git commit -m "ci: add semgrep and gitleaks to security scanning workflow"
```

---

## Stream 4: Code Quality

### Task 4.1: Add ESLint Complexity Rules

**Files:**

- Modify: `eslint.config.js`

- [ ] **Step 1: Add complexity rules to eslint.config.js**

Add to the `rules` object:

```javascript
'complexity': ['warn', { max: 15 }],
'max-depth': ['warn', { max: 4 }],
'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
'max-params': ['warn', { max: 5 }],
'max-nested-callbacks': ['warn', { max: 3 }],
```

- [ ] **Step 2: Run lint to see violations**

```bash
pnpm lint 2>&1 | head -50
```

- [ ] **Step 3: Fix critical violations**

Address any `error`-level violations. `warn`-level can be addressed incrementally.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore: add ESLint complexity rules (warn level) for code quality"
```

---

### Task 4.2: Add Stricter Linting Rules

**Files:**

- Modify: `eslint.config.js`

- [ ] **Step 1: Add additional rules**

```javascript
'no-implicit-coercion': 'error',
'no-return-assign': 'error',
'no-sequences': 'error',
'no-throw-literal': 'error',
'no-unmodified-loop-condition': 'error',
'no-useless-call': 'error',
'no-useless-concat': 'error',
'no-useless-return': 'error',
'prefer-template': 'error',
'no-var': 'error',
```

- [ ] **Step 2: Run lint and fix violations**

```bash
pnpm lint:fix
```

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: add stricter ESLint rules for code quality"
```

---

## Stream 5: Multiplatform

### Task 5.1: Add 'ios' to Platform Type

**Files:**

- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Update Platform type**

Change:

```typescript
export type Platform = 'windows' | 'linux' | 'android' | 'macos';
```

To:

```typescript
export type Platform = 'windows' | 'linux' | 'android' | 'macos' | 'ios';
```

- [ ] **Step 2: Update platform detection in packages/shared/src/utils.ts**

Add iOS detection to `getPlatform()`:

```typescript
if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/utils.ts
git commit -m "feat: add 'ios' to Platform type for iOS support"
```

---

### Task 5.2: Create Linux Snap Package Config

**Files:**

- Create: `snap/snapcraft.yaml`

- [ ] **Step 1: Create snapcraft.yaml**

```yaml
name: ghita-coding-agent
base: core22
version: '0.0.4'
summary: AI Desktop Agent with VS Code-style interface
description: |
  GHITA CODING AGENT is a versatile AI desktop application with
  VS Code-style interface, supporting remote computer control via Android phone.

grade: stable
confinement: strict
parts:
  ghita:
    plugin: nil
    source: .
    build-packages:
      - nodejs
      - npm
    override-build: |
      npm install -g pnpm
      pnpm install
      pnpm build:desktop
      cp -r apps/desktop/src-tauri/target/release/bundle/snap/* $CRAFT_PART_INSTALL/
apps:
  ghita:
    command: ghita-coding-agent
    plugs:
      - network
      - home
      - x11
```

- [ ] **Step 2: Commit**

```bash
git add snap/
git commit -m "build: add Snap package configuration for Linux distribution"
```

---

## Stream 6: Dependencies

### Task 6.1: Add Renovate Configuration

**Files:**

- Create: `renovate.json`

- [ ] **Step 1: Create renovate.json**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchDepTypes": ["devDependencies"],
      "groupName": "dev-dependencies",
      "schedule": ["every weekend"]
    },
    {
      "matchDepTypes": ["dependencies"],
      "groupName": "production-dependencies",
      "schedule": ["every weekday"]
    },
    {
      "matchPackagePatterns": ["*"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    }
  ],
  "automergeType": "pr",
  "platformAutomerge": true,
  "prConcurrentLimit": 10,
  "prHourlyLimit": 5
}
```

- [ ] **Step 2: Commit**

```bash
git add renovate.json
git commit -m "chore: add Renovate bot configuration for automated dependency updates"
```

---

### Task 6.2: Add License Scanning CI Workflow

**Files:**

- Create: `.github/workflows/license-scan.yml`

- [ ] **Step 1: Create workflow**

```yaml
name: License Scan
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  license-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Check licenses
        run: |
          npx license-checker --production --summary --failOn "GPL-3.0;AGPL-3.0;SSPL"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/license-scan.yml
git commit -m "ci: add license scanning workflow to block incompatible licenses"
```

---

## Stream 7: Community

### Task 7.1: Create Example Projects

**Files:**

- Create: `examples/custom-skill/README.md`, `package.json`, `src/index.ts`, `src/__tests__/index.test.ts`
- Create: `examples/agent-workflow/README.md`, `package.json`, `src/index.ts`
- Create: `examples/remote-control/README.md`, `package.json`, `src/index.ts`
- Create: `examples/browser-automation/README.md`, `package.json`, `src/index.ts`
- Create: `examples/computer-use/README.md`, `package.json`, `src/index.ts`
- Create: `examples/mcp-server/README.md`, `package.json`, `src/index.ts`

- [ ] **Step 1: Create custom-skill example**

`examples/custom-skill/package.json`:

```json
{
  "name": "@ghita/example-custom-skill",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@ghita/skills": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

`examples/custom-skill/src/index.ts`:

```typescript
import type { SkillDefinition } from '@ghita/skills';

export const weatherSkill: SkillDefinition = {
  name: 'weather',
  description: 'Get current weather for a location',
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
    },
    required: ['location'],
  },
  execute: async (params: { location: string }) => {
    // In real implementation, call weather API
    return {
      location: params.location,
      temperature: 22,
      condition: 'sunny',
    };
  },
};
```

`examples/custom-skill/src/__tests__/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { weatherSkill } from '../index.js';

describe('weatherSkill', () => {
  it('should have correct metadata', () => {
    expect(weatherSkill.name).toBe('weather');
    expect(weatherSkill.version).toBe('1.0.0');
  });

  it('should execute with location', async () => {
    const result = await weatherSkill.execute({ location: 'Hanoi' });
    expect(result.location).toBe('Hanoi');
    expect(result.temperature).toBeDefined();
  });
});
```

`examples/custom-skill/README.md`:

```markdown
# Custom Skill Example

Demonstrates how to create a custom skill for GHITA CODING AGENT.

## Run

\`\`\`bash
pnpm --filter @ghita/example-custom-skill test
\`\`\`
```

- [ ] **Step 2: Create remaining examples (same pattern)**

Each example has: README.md, package.json, src/index.ts with working code.

- [ ] **Step 3: Commit**

```bash
git add examples/
git commit -m "docs: add 6 example projects demonstrating GHITA features"
```

---

### Task 7.2: Add Contributor Recognition

**Files:**

- Create: `.all-contributorsrc`
- Modify: `README.md`

- [ ] **Step 1: Create .all-contributorsrc**

```json
{
  "projectName": "GHITA-CODING-AGENT",
  "projectOwner": "ghitatruongle",
  "repoType": "github",
  "repoHost": "https://github.com",
  "files": ["README.md"],
  "imageSize": 100,
  "commit": true,
  "commitConvention": "conventional",
  "contributors": [
    {
      "login": "ghitatruongle",
      "name": "Ghita Truong Le",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "profile": "https://github.com/ghitatruongle",
      "contributions": ["code", "doc", "design", "maintenance"]
    }
  ]
}
```

- [ ] **Step 2: Add contributors section to README.md**

Add before the License section:

```markdown
## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START -->
<!-- ALL-CONTRIBUTORS-LIST:END -->
```

- [ ] **Step 3: Commit**

```bash
git add .all-contributorsrc README.md
git commit -m "docs: add all-contributors recognition system"
```

---

### Task 7.3: Add Changelog Automation

**Files:**

- Create: `.github/workflows/release-please.yml`
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`

- [ ] **Step 1: Create release-please config**

`release-please-config.json`:

```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true
    }
  }
}
```

`.release-please-manifest.json`:

```json
{
  ".": "0.0.4"
}
```

- [ ] **Step 2: Create workflow**

`.github/workflows/release-please.yml`:

```yaml
name: Release Please
on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 3: Commit**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows/release-please.yml
git commit -m "ci: add release-please for automated changelog and version bumps"
```

---

## Verification Checklist

After completing all streams:

- [ ] All packages build: `pnpm build:packages`
- [ ] All tests pass: `pnpm test`
- [ ] No lint errors: `pnpm lint`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Coverage meets threshold: `pnpm test:coverage`
- [ ] New packages have tests
- [ ] ADRs are documented
- [ ] Examples are working
- [ ] CI workflows are valid YAML
- [ ] No circular dependencies introduced

---

_Plan written: 2026-06-24_
