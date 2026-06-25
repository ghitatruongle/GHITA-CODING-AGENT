// ==============================================================================
// GHITA CODING AGENT — Settings Screen
// App preferences, paired devices management, data clearing
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  clearAllData,
  loadPairedDevices,
  loadSettings,
  removePairedDevice,
  saveSettings as saveSettingsToStorage,
} from '../services/storageService';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import type { MobileSettings, PairedDevice } from '../types';
import { DEFAULT_MOBILE_SETTINGS } from '../types';
import type { SettingsScreenProps } from '../navigation/types';
import { useTranslation } from '../i18n/context';

export function SettingsScreen({ navigation }: SettingsScreenProps): React.JSX.Element {
  const { t, lang, changeLanguage } = useTranslation();
  const { colors, themeType, setThemeType } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState<MobileSettings>(DEFAULT_MOBILE_SETTINGS);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadAllSettings();
  }, [lang]);

  useEffect(() => {
    loadAllDevices();
  }, []);

  const loadAllSettings = async () => {
    const saved = await loadSettings();
    setSettings(saved);
  };

  const loadAllDevices = async () => {
    const devices = await loadPairedDevices();
    setPairedDevices(devices);
  };

  const handleSaveSettings = useCallback((updated: MobileSettings) => {
    setSettings(updated);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void saveSettingsToStorage(updated);
    }, 500);
  }, []);

  const handleLanguageChange = useCallback(
    async (newLang: string) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const updatedSettings = { ...settings, language: newLang };
      setSettings(updatedSettings);
      await saveSettingsToStorage(updatedSettings);
      await changeLanguage(newLang);
    },
    [settings, changeLanguage],
  );

  const handleRemoveDevice = async (deviceId: string) => {
    Alert.alert(t('settings.removeDeviceConfirmTitle'), t('settings.removeDeviceConfirmDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await removePairedDevice(deviceId);
          await loadAllDevices();
        },
      },
    ]);
  };

  const handleClearAll = async () => {
    Alert.alert(t('settings.clearAllConfirmTitle'), t('settings.clearAllConfirmDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await clearAllData();
          setSettings(DEFAULT_MOBILE_SETTINGS);
          setPairedDevices([]);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.backBtnText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.deviceSection')}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.deviceNameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={settings.deviceName}
              onChangeText={(v) => handleSaveSettings({ ...settings, deviceName: v })}
              placeholder={t('settings.deviceNamePlaceholder')}
              placeholderTextColor={colors.textDark}
              clearButtonMode="while-editing"
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.optionsSection')}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.autoReconnectLabel')}</Text>
            <Switch
              value={settings.autoReconnect}
              onValueChange={(v) => handleSaveSettings({ ...settings, autoReconnect: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.vibrateLabel')}</Text>
            <Switch
              value={settings.vibrationEnabled}
              onValueChange={(v) => handleSaveSettings({ ...settings, vibrationEnabled: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>
          {/* Theme selection */}
          <View style={styles.row}>
            <Text style={styles.label}>Theme</Text>
            <View style={styles.langSelector}>
              <TouchableOpacity
                style={[styles.langBtn, themeType === 'system' && styles.langBtnActive]}
                onPress={() => setThemeType('system')}
              >
                <Text
                  style={[styles.langBtnText, themeType === 'system' && styles.langBtnTextActive]}
                >
                  System
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, themeType === 'light' && styles.langBtnActive]}
                onPress={() => setThemeType('light')}
              >
                <Text
                  style={[styles.langBtnText, themeType === 'light' && styles.langBtnTextActive]}
                >
                  Light
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, themeType === 'dark' && styles.langBtnActive]}
                onPress={() => setThemeType('dark')}
              >
                <Text
                  style={[styles.langBtnText, themeType === 'dark' && styles.langBtnTextActive]}
                >
                  Dark
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Language selection */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.languageLabel')}</Text>
            <View style={styles.langSelector}>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'vi' && styles.langBtnActive]}
                onPress={() => handleLanguageChange('vi')}
              >
                <Text style={[styles.langBtnText, lang === 'vi' && styles.langBtnTextActive]}>
                  VI
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
                onPress={() => handleLanguageChange('en')}
              >
                <Text style={[styles.langBtnText, lang === 'en' && styles.langBtnTextActive]}>
                  EN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'zh' && styles.langBtnActive]}
                onPress={() => handleLanguageChange('zh')}
              >
                <Text style={[styles.langBtnText, lang === 'zh' && styles.langBtnTextActive]}>
                  ZH
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'ru' && styles.langBtnActive]}
                onPress={() => handleLanguageChange('ru')}
              >
                <Text style={[styles.langBtnText, lang === 'ru' && styles.langBtnTextActive]}>
                  RU (beta)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'ja' && styles.langBtnActive]}
                onPress={() => handleLanguageChange('ja')}
              >
                <Text style={[styles.langBtnText, lang === 'ja' && styles.langBtnTextActive]}>
                  JA (beta)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Paired Devices */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('settings.pairedSection')} ({pairedDevices.length})
          </Text>
          {pairedDevices.length === 0 ? (
            <Text style={styles.emptyText}>{t('settings.noPairedDevices')}</Text>
          ) : (
            pairedDevices.map((device) => (
              <View key={device.id} style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name || 'Unknown'}</Text>
                  <Text style={styles.deviceId}>{device.address}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveDevice(device.id)}
                  accessibilityLabel={t('common.remove')}
                >
                  <Text style={styles.removeBtn}>{t('common.remove')}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleClearAll}>
            <Text style={styles.dangerBtnText}>{t('settings.clearAllBtn')}</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.version}>GHITA Agent Remote v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backBtnText: {
      color: colors.primaryLight,
      fontSize: FontSize.xxl,
      fontWeight: '700',
    },
    headerTitle: {
      color: colors.primaryLight,
      fontSize: FontSize.lg,
      fontWeight: '700',
    },
    headerSpacer: {
      width: 44,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.xl,
      gap: Spacing.lg,
      paddingBottom: Spacing.huge,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      color: colors.primaryLight,
      fontSize: FontSize.sm,
      fontWeight: '600',
      marginBottom: Spacing.md,
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    label: {
      fontSize: FontSize.md,
      color: colors.textPrimary,
    },
    input: {
      fontSize: FontSize.md,
      color: colors.textPrimary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: Spacing.xs,
      minWidth: 150,
      textAlign: 'right',
    },
    emptyText: {
      fontSize: FontSize.sm,
      color: colors.textDark,
      fontStyle: 'italic',
    },
    deviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    deviceInfo: {
      flex: 1,
    },
    deviceName: {
      fontSize: FontSize.md,
      color: colors.textPrimary,
    },
    deviceId: {
      fontSize: FontSize.xs,
      color: colors.textDark,
    },
    removeBtn: {
      fontSize: FontSize.sm,
      color: colors.error,
    },
    dangerBtn: {
      backgroundColor: colors.error,
      padding: Spacing.md,
      borderRadius: Radius.md,
      alignItems: 'center',
    },
    dangerBtnText: {
      color: colors.white,
      fontSize: FontSize.md,
      fontWeight: '600',
    },
    version: {
      fontSize: FontSize.xs,
      color: colors.textDark,
      textAlign: 'center',
      marginTop: Spacing.xl,
      marginBottom: Spacing.xl,
    },
    langSelector: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    langBtn: {
      backgroundColor: colors.backgroundTertiary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    langBtnActive: {
      backgroundColor: colors.primaryMuted,
      borderColor: colors.primary,
    },
    langBtnText: {
      color: colors.textSecondary,
      fontSize: FontSize.sm,
      fontWeight: '600',
    },
    langBtnTextActive: {
      color: colors.primary,
    },
  });
