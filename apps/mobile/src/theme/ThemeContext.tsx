import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, ThemeColors } from './colors';
import * as storageService from '../services/storageService';

type ThemeType = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  themeType: ThemeType;
  setThemeType: (type: ThemeType) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  isDark: true,
  themeType: 'system',
  setThemeType: async () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeType, setThemeTypeState] = useState<ThemeType>('system');

  useEffect(() => {
    // Load theme setting from storage
    storageService.loadSettings().then((settings) => {
      if (settings.theme) {
        setThemeTypeState(settings.theme as ThemeType);
      }
    });
  }, []);

  const setThemeType = async (type: ThemeType) => {
    setThemeTypeState(type);
    const settings = await storageService.loadSettings();
    await storageService.saveSettings({ ...settings, theme: type });
  };

  const isDark = themeType === 'system' ? systemColorScheme === 'dark' : themeType === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, isDark, themeType, setThemeType }}>
      {children}
    </ThemeContext.Provider>
  );
}
