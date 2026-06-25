// ==============================================================================
// @ghita/a11y -- Type Definitions
// ==============================================================================

export type WcagLevel = 'A' | 'AA' | 'AAA';
export type A11ySeverity = 'info' | 'warning' | 'error' | 'critical';
export type A11yCategory =
  | 'color-contrast'
  | 'aria'
  | 'keyboard'
  | 'screen-reader'
  | 'semantic-html'
  | 'forms'
  | 'images'
  | 'focus-management'
  | 'motion';

export interface A11yIssue {
  id: string;
  category: A11yCategory;
  severity: A11ySeverity;
  wcagLevel: WcagLevel;
  wcagCriterion: string;
  title: string;
  description: string;
  selector?: string;
  element?: string;
  remediation: string;
  detectedAt: number;
}

export interface A11yReport {
  id: string;
  runAt: number;
  issues: A11yIssue[];
  counts: Record<A11ySeverity, number>;
  score: number;
  passed: boolean;
  threshold: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface ContrastResult {
  ratio: number;
  passAA: boolean;
  passAALarge: boolean;
  passAAA: boolean;
  passAAALarge: boolean;
  foregroundLuminance: number;
  backgroundLuminance: number;
}

export interface AriaValidationResult {
  valid: boolean;
  errors: AriaValidationError[];
  warnings: AriaValidationWarning[];
}

export interface AriaValidationError {
  code: string;
  attribute: string;
  message: string;
  selector?: string;
}

export interface AriaValidationWarning {
  code: string;
  attribute: string;
  message: string;
  selector?: string;
}

export type AnnouncementPriority = 'polite' | 'assertive';

export interface ScreenReaderText {
  accessibleName: string;
  accessibleDescription?: string;
  needsLabel: boolean;
  needsDescription: boolean;
  suggestedRole?: string;
}

export interface A11yCheckerConfig {
  threshold?: number;
  wcagLevel?: WcagLevel;
  categories?: A11yCategory[];
  skipIds?: string[];
}
