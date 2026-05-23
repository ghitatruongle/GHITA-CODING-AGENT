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

export function SettingsScreen({ navigation }: SettingsScreenProps): React.JSX.Element {
  const [settings, setSettings] = useState<MobileSettings>(DEFAULT_MOBILE_SETTINGS);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);

  useEffect(() => {
    loadAllSettings();
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

  const handleSaveSettings = async (updated: MobileSettings) => {
    setSettings(updated);
    await saveSettingsToStorage(updated);
  };

  const handleRemoveDevice = async (deviceId: string) => {
    Alert.alert('Xoa thiet bi', 'Ban co chac muon xoa thiet bi nay?', [
      { text: 'Huy', style: 'cancel' },
      {
        text: 'Xoa',
        style: 'destructive',
        onPress: async () => {
          await removePairedDevice(deviceId);
          await loadAllDevices();
        },
      },
    ]);
  };

  const handleClearAll = async () => {
    Alert.alert('Xoa tat ca', 'Xoa toan bo du lieu va cai dat?', [
      { text: 'Huy', style: 'cancel' },
      {
        text: 'Xoa',
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
        <Text style={styles.headerTitle}>Cai dat</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Device Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thiet bi</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Ten thiet bi</Text>
            <TextInput
              style={styles.input}
              value={settings.deviceName}
              onChangeText={(v) => handleSaveSettings({ ...settings, deviceName: v })}
              placeholder="Nhap ten..."
              placeholderTextColor={Colors.textDark}
            />
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tuy chon</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Tu dong ket noi lai</Text>
            <Switch
              value={settings.autoReconnect}
              onValueChange={(v) => handleSaveSettings({ ...settings, autoReconnect: v })}
              trackColor={{ true: Colors.primary }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Rung khi co thong bao</Text>
            <Switch
              value={settings.vibrationEnabled}
              onValueChange={(v) => handleSaveSettings({ ...settings, vibrationEnabled: v })}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </View>

        {/* Paired Devices */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Thiet bi da ghep doi ({pairedDevices.length})
          </Text>
          {pairedDevices.length === 0 ? (
            <Text style={styles.emptyText}>Chua co thiet bi nao</Text>
          ) : (
            pairedDevices.map((device) => (
              <View key={device.id} style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name || 'Unknown'}</Text>
                  <Text style={styles.deviceId}>{device.address}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveDevice(device.id)}>
                  <Text style={styles.removeBtn}>Xoa</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleClearAll}>
            <Text style={styles.dangerBtnText}>Xoa tat ca du lieu</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.version}>GHITA Agent Remote v0.0.2-beta2</Text>
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
});
