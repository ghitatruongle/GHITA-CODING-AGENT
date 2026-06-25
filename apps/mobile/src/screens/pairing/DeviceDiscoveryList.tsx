// ==============================================================================
// GHITA CODING AGENT — DeviceDiscoveryList Component
// Bluetooth device list with scan/rescan and empty state
// ==============================================================================

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../../theme/styles';
import type { BluetoothDevice } from '../../services/bluetoothService';
import { useTranslation } from '../../i18n/context';

interface DeviceDiscoveryListProps {
  devices: BluetoothDevice[];
  isScanning: boolean;
  isConnecting: boolean;
  onRescan: () => void;
  onSelectDevice: (device: BluetoothDevice) => void;
}

export function DeviceDiscoveryList({
  devices,
  isScanning,
  isConnecting,
  onRescan,
  onSelectDevice,
}: DeviceDiscoveryListProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{t('pairing.btDevicesHeader')}</Text>
        {isScanning ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <TouchableOpacity
            onPress={onRescan}
            style={styles.rescanBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Text style={styles.scanActionText}>{t('pairing.btRescan')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {isScanning ? t('pairing.btNoDevicesScanning') : t('pairing.btNoDevicesRescan')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item, index) => `${item.address}-${index}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.deviceItem}
              onPress={() => onSelectDevice(item)}
              disabled={isConnecting}
            >
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{item.name}</Text>
                <Text style={styles.deviceAddress}>
                  {item.bonded ? t('pairing.btBonded') : t('pairing.btNewDevice')} • {item.address}
                </Text>
              </View>
              <Text style={styles.connectAction}>{t('pairing.connectBtn')}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    label: {
      fontSize: FontSize.sm,
      color: colors.textSecondary,
      marginBottom: 0,
      fontWeight: '600',
    },
    rescanBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
    scanActionText: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
    emptyContainer: { paddingVertical: Spacing.lg, alignItems: 'center' },
    emptyText: { color: colors.textMuted, fontSize: FontSize.sm },
    deviceItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    deviceInfo: { flex: 1 },
    deviceName: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    deviceAddress: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 2 },
    connectAction: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: FontSize.sm,
      marginLeft: 8,
    },
  });
