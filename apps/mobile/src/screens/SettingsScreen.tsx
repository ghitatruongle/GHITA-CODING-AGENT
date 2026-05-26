// ==============================================================================
// GHITA CODING AGENT — Settings Screen
// App preferences, paired devices management, data clearing
// ==============================================================================

import React, { useState, useEffect } from 'react';
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
  loadSettings,
  saveSettings as saveSettingsToStorage,
  loadPairedDevices,
  removePairedDevice,
  clearAllData,
} from '../services/storageService';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import type { MobileSettings, PairedDevice } from '../types';
import { DEFAULT_MOBILE_SETTINGS } from '../types';
import type { SettingsScreenProps } from '../navigation/types';
import { useTranslation } from '../i18n/context';

export function SettingsScreen({ navigation }: SettingsScreenProps): React.JSX.Element {
  const { t, lang, changeLanguage } = useTranslation();
  const [settings, setSettings] = useState<MobileSettings>(DEFAULT_MOBILE_SETTINGS);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);

  useEffect(() => {
    loadAllSettings();
    loadAllDevices();
  }, [lang]);

  const loadAllSettings = async () => {
    const saved = await loadSettings();
    setSettings(saved);
  };

  const loadAllDevices = async () => {
    const devices = await loadPairedDevices();
    setPairedDevices(devices);
  };

  const handleSaveSettings = async (updated: MobileSettings) => {
    setSettings(updated);
    await saveSettingsToStorage(updated);
  };

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
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
              placeholderTextColor={Colors.textDark}
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
              trackColor={{ true: Colors.primary }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.vibrateLabel')}</Text>
            <Switch
              value={settings.vibrationEnabled}
              onValueChange={(v) => handleSaveSettings({ ...settings, vibrationEnabled: v })}
              trackColor={{ true: Colors.primary }}
            />
          </View>
          {/* Language selection */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('settings.languageLabel')}</Text>
            <View style={styles.langSelector}>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'vi' && styles.langBtnActive]}
                onPress={() => changeLanguage('vi')}
              >
                <Text style={[styles.langBtnText, lang === 'vi' && styles.langBtnTextActive]}>VI</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
                onPress={() => changeLanguage('en')}
              >
                <Text style={[styles.langBtnText, lang === 'en' && styles.langBtnTextActive]}>EN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, lang === 'zh' && styles.langBtnActive]}
                onPress={() => changeLanguage('zh')}
              >
                <Text style={[styles.langBtnText, lang === 'zh' && styles.langBtnTextActive]}>ZH</Text>
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
                <TouchableOpacity onPress={() => handleRemoveDevice(device.id)}>
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
        <Text style={styles.version}>GHITA Agent Remote v0.0.2</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: Colors.primaryLight,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  headerTitle: {
    color: Colors.primaryLight,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    color: Colors.primaryLight,
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
    borderBottomColor: Colors.border,
  },
  label: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  input: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.xs,
    minWidth: 150,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textDark,
    fontStyle: 'italic',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  deviceId: {
    fontSize: FontSize.xs,
    color: Colors.textDark,
  },
  removeBtn: {
    fontSize: FontSize.sm,
    color: Colors.error,
  },
  dangerBtn: {
    backgroundColor: Colors.error,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  version: {
    fontSize: FontSize.xs,
    color: Colors.textDark,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  langSelector: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  langBtn: {
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  langBtnActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  langBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  langBtnTextActive: {
    color: Colors.primary,
  },
});
