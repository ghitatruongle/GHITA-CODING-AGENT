// @ghita/i18n -- I18nManager

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
      current = (current as TranslationMessages)[key] as string | TranslationMessages;
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
