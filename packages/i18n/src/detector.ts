// ==============================================================================
// @ghita/i18n -- Locale Detector
// ==============================================================================

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
          locale: (locale ?? '').trim(),
          quality: q ? parseFloat(q) : 1,
        };
      })
      .sort((a, b) => b.quality - a.quality);
  }

  private findMatch(locale: string, supported: readonly Locale[]): Locale | undefined {
    const normalized = locale.toLowerCase();
    for (const s of supported) {
      if (s.toLowerCase() === normalized) return s;
      if (s.toLowerCase().startsWith(`${normalized}-`)) return s;
      if (normalized.startsWith(`${s.toLowerCase()}-`)) return s;
    }
    return undefined;
  }
}
