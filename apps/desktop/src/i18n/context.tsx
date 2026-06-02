// ==============================================================================
// GHITA CODING AGENT — i18n Context & Hook
// ==============================================================================

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppStore } from '../stores/appStore';
import { vi } from './vi';
import { en } from './en';
import { zh } from './zh';
import type { TranslationKeys } from './types';

type Translations = TranslationKeys;
type TFunction = (key: string, params?: Record<string, string | number>) => string;

const translations: Record<string, Translations> = { vi, en, zh };

const I18nContext = createContext<{ t: TFunction; lang: string }>({
  // BUG FIX #10: the previous default swallowed params entirely, so
  // `t('codeView.fileSaved', { name: 'a.ts' })` rendered as the raw key
  // `codeView.fileSaved` instead of interpolating the name. Substitute
  // `{name}` placeholders from the params object so the fallback output
  // is at least as informative as the real one.
  t: (key, params) => {
    if (!params) return key;
    return key.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined || value === null ? match : String(value);
    });
  },
  lang: 'vi',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useAppStore((s) => s.language);

  const value = useMemo(() => {
    const dict = translations[language] || translations.vi;

  const t: TFunction = (key, params) => {
    const parts = key.split('.');
    let result: unknown = dict as unknown;
    for (const part of parts) {
      if (result != null && typeof result === 'object') {
        result = (result as Record<string, unknown>)[part];
      } else {
        return key;
      }
    }
    if (typeof result !== 'string') return key;

      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
          result,
        );
      }
      return result;
    };

    return { t, lang: language };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}
