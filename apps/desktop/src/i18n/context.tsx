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
  t: (key) => key,
  lang: 'vi',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useAppStore((s) => s.language);

  const value = useMemo(() => {
    const dict = translations[language] || translations.vi;

    const t: TFunction = (key, params) => {
      const parts = key.split('.');
      let result: any = dict;
      for (const part of parts) {
        result = result?.[part];
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
