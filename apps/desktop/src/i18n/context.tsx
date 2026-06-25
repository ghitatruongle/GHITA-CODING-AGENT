// ==============================================================================
// GHITA CODING AGENT — i18n Context & Hook
// ==============================================================================

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppStore } from '../stores/appStore';
import { vi } from './vi';
import { en } from './en';
import { zh } from './zh';
import { ru } from './ru';
import { ja } from './ja';
import { ko } from './ko';
import type { TranslationKeys } from './types';

type Translations = TranslationKeys;
type TFunction = (key: string, params?: Record<string, string | number>) => string;

const translations: Record<string, Translations> = { vi, en, zh, ru, ja, ko };

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
    const dict = translations[language] || vi;

    const t: TFunction = (key, params) => {
      const parts = key.split('.');

      const resolveKey = (dictionary: Translations): unknown => {
        let res: unknown = dictionary as unknown;
        for (const part of parts) {
          if (res != null && typeof res === 'object') {
            res = (res as Record<string, unknown>)[part];
          } else {
            return undefined;
          }
        }
        return res;
      };

      let result = resolveKey(dict);
      if (result === undefined && language !== 'vi') {
        result = resolveKey(vi);
      }

      if (result === undefined) {
        return key;
      }

      // Support pluralization when { count: number } is passed
      if (
        params &&
        typeof params.count === 'number' &&
        result != null &&
        typeof result === 'object'
      ) {
        const pluralRules = new Intl.PluralRules(language || 'vi');
        const pluralForm = pluralRules.select(params.count);
        const pluralKey = params.count === 0 ? 'zero' : pluralForm;
        let pluralResult = (result as Record<string, unknown>)[pluralKey];
        if (typeof pluralResult !== 'string') {
          pluralResult = (result as Record<string, unknown>)['other'];
        }
        if (typeof pluralResult === 'string') {
          result = pluralResult;
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
