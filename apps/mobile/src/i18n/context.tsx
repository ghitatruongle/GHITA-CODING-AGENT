// ==============================================================================
// GHITA CODING AGENT — i18n Context & Hook for React Native
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { loadSettings, saveSettings } from '../services/storageService';
import { socketService } from '../services/socketService';
import { vi } from './vi';
import { en } from './en';
import { zh } from './zh';
import type { TranslationKeys } from './types';

type Translations = TranslationKeys;
type TFunction = (key: string, params?: Record<string, string | number>) => any;

const translations: Record<string, Translations> = { vi, en, zh };

interface I18nContextProps {
  t: TFunction;
  lang: string;
  changeLanguage: (lang: string) => Promise<void>;
}

const I18nContext = createContext<I18nContextProps>({
  t: (key) => key,
  lang: 'vi',
  changeLanguage: async () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<string>('vi');

  // Load language settings on mount
  useEffect(() => {
    const initLang = async () => {
      const settings = await loadSettings();
      // If settings has language (we will add it to types), use it
      const savedLang = (settings as any).language || 'vi';
      setLang(savedLang);
    };
    void initLang();
  }, []);

  // Listen to socket sync language events
  useEffect(() => {
    const unsubscribe = socketService.onLanguageSync(async (syncLang) => {
      if (syncLang && translations[syncLang] && syncLang !== lang) {
        console.log(`[I18nProvider] Syncing language from socket: ${syncLang}`);
        setLang(syncLang);
        const settings = await loadSettings();
        await saveSettings({ ...settings, language: syncLang } as any);
      }
    });
    return unsubscribe;
  }, [lang]);

  const changeLanguage = async (newLang: string) => {
    if (!translations[newLang]) return;
    setLang(newLang);
    const settings = await loadSettings();
    await saveSettings({ ...settings, language: newLang } as any);
    
    // Broadcast via socket if connected
    if (socketService.isConnected) {
      socketService.sendSyncLanguage(newLang);
    }
  };

  const value = useMemo(() => {
    const dict = translations[lang] || translations.vi;

    const t: TFunction = (key, params) => {
      const parts = key.split('.');
      let result: any = dict;
      for (const part of parts) {
        result = result?.[part];
      }
      if (Array.isArray(result)) return result;
      if (typeof result !== 'string') return key;

      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
          result,
        );
      }
      return result;
    };

    return { t, lang, changeLanguage };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}
