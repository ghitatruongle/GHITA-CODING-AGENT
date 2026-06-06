// ==============================================================================
// GHITA CODING AGENT - i18n / Multi-language Support (Phase 48)
// i18next-based internationalization with VN/EN/CN/JA/KO locales
// ==============================================================================

// --- Types ---

export type LocaleCode = 'vi' | 'en' | 'zh' | 'ja' | 'ko';

export interface TranslationStrings {
  [key: string]: string | TranslationStrings;
}

export interface I18nConfig {
  defaultLocale: LocaleCode;
  fallbackLocale: LocaleCode;
  supportedLocales: LocaleCode[];
  rtlLocales?: LocaleCode[];
}

export interface FormatOptions {
  locale: LocaleCode;
  style?: 'short' | 'long' | 'full';
}

// --- Default Config ---

const DEFAULT_CONFIG: I18nConfig = {
  defaultLocale: 'en',
  fallbackLocale: 'en',
  supportedLocales: ['vi', 'en', 'zh', 'ja', 'ko'],
  rtlLocales: [],
};

// --- Locale Data ---

const LOCALE_NAMES: Record<LocaleCode, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
};

// --- i18n Engine ---

export class I18nEngine {
  private config: I18nConfig;
  private currentLocale: LocaleCode;
  private translations = new Map<LocaleCode, TranslationStrings>();
  private listeners: Array<(locale: LocaleCode) => void> = [];

  constructor(config?: Partial<I18nConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentLocale = this.config.defaultLocale;
  }

  /**
   * Register translations for a locale.
   */
  addTranslations(locale: LocaleCode, strings: TranslationStrings): void {
    const existing = this.translations.get(locale) ?? {};
    this.translations.set(locale, this.deepMerge(existing, strings));
  }

  /**
   * Get a translated string by key (dot-separated path).
   */
  t(key: string, params?: Record<string, string | number>): string {
    let result = this.resolve(key, this.currentLocale);
    if (!result) {
      result = this.resolve(key, this.config.fallbackLocale);
    }
    if (!result) return key;

    // Interpolate parameters
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      }
    }

    return result;
  }

  /**
   * Change the current locale.
   */
  setLocale(locale: LocaleCode): void {
    if (!this.config.supportedLocales.includes(locale)) {
      throw new Error(`Locale '${locale}' is not supported`);
    }
    this.currentLocale = locale;
    for (const listener of this.listeners) {
      listener(locale);
    }
  }

  /**
   * Get current locale.
   */
  getLocale(): LocaleCode {
    return this.currentLocale;
  }

  /**
   * Check if a locale is RTL.
   */
  isRTL(locale?: LocaleCode): boolean {
    const l = locale ?? this.currentLocale;
    return this.config.rtlLocales?.includes(l) ?? false;
  }

  /**
   * Get all supported locales.
   */
  getSupportedLocales(): Array<{ code: LocaleCode; name: string; isRTL: boolean }> {
    return this.config.supportedLocales.map((code) => ({
      code,
      name: LOCALE_NAMES[code] ?? code,
      isRTL: this.isRTL(code),
    }));
  }

  /**
   * Register a locale change listener.
   */
  onChange(listener: (locale: LocaleCode) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  // --- Private ---

  private resolve(key: string, locale: LocaleCode): string | undefined {
    const translations = this.translations.get(locale);
    if (!translations) return undefined;

    const parts = key.split('.');
    let current: unknown = translations;

    for (const part of parts) {
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return typeof current === 'string' ? current : undefined;
  }

  private deepMerge(target: TranslationStrings, source: TranslationStrings): TranslationStrings {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'string') {
        result[key] = value;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const existing = result[key];
        if (typeof existing === 'object' && !Array.isArray(existing)) {
          result[key] = this.deepMerge(existing as TranslationStrings, value);
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
}

// --- Number/Date Formatting ---

export class LocaleFormatter {
  private locale: LocaleCode;

  constructor(locale: LocaleCode) {
    this.locale = locale;
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale, options).format(value);
  }

  formatCurrency(value: number, currency = 'USD'): string {
    return new Intl.NumberFormat(this.locale, {
      style: 'currency',
      currency,
    }).format(value);
  }

  formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale, options ?? {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  formatRelativeTime(seconds: number): string {
    const rtf = new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' });
    const absSeconds = Math.abs(seconds);

    if (absSeconds < 60) return rtf.format(seconds, 'second');
    if (absSeconds < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
    if (absSeconds < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
    return rtf.format(Math.round(seconds / 86400), 'day');
  }
}

// --- Built-in Translations ---

export const EN_TRANSLATIONS: TranslationStrings = {
  app: { title: 'GHITA Coding Agent', subtitle: 'AI-powered coding assistant' },
  common: { save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', close: 'Close' },
  chat: { placeholder: 'Type a message...', send: 'Send', newChat: 'New Chat' },
  settings: { title: 'Settings', theme: 'Theme', language: 'Language', providers: 'Providers' },
  errors: { network: 'Network error', timeout: 'Request timed out', unknown: 'An unknown error occurred' },
};

export const VI_TRANSLATIONS: TranslationStrings = {
  app: { title: 'GHITA Coding Agent', subtitle: 'Trợ lý lập trình AI' },
  common: { save: 'Lưu', cancel: 'Hủy', delete: 'Xóa', edit: 'Sửa', close: 'Đóng' },
  chat: { placeholder: 'Nhập tin nhắn...', send: 'Gửi', newChat: 'Cuộc trò chuyện mới' },
  settings: { title: 'Cài đặt', theme: 'Giao diện', language: 'Ngôn ngữ', providers: 'Nhà cung cấp' },
  errors: { network: 'Lỗi mạng', timeout: 'Yêu cầu hết thời gian', unknown: 'Đã xảy ra lỗi không xác định' },
};
