// @ghita/i18n -- Type Definitions

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
