// ==============================================================================
// GHITA CODING AGENT — Pairing Screen (Wi-Fi & Bluetooth Modes)
// Connect to desktop via IP/Cloud Discovery or Bluetooth/PC Name Discovery
// ==============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { socketService } from '../services/socketService';
import { CLOUD_DISCOVERY_API_KEY, CLOUD_DISCOVERY_API_URL } from '../config';
import { getLastServer, saveLastServer, getDeviceId } from '../services/storageService';
import type { BluetoothDevice } from '../services/bluetoothService';
import { bluetoothService } from '../services/bluetoothService';
import type { ConnectionState } from '../types';
import type { PairingScreenProps } from '../navigation/types';
import { useTranslation } from '../i18n/context';

const PAIRING_CODE_LENGTH = 6;

export function PairingScreen({ navigation }: PairingScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'wifi' | 'bluetooth'>('wifi');
  const [pairingCode, setPairingCode] = useState('');
  const [serverAddress, setServerAddress] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const connectionStateRef = useRef<ConnectionState>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bluetooth specific states
  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [isScanningBt, setIsScanningBt] = useState(false);
  const [manualPcName, setManualPcName] = useState('');

  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeAddressRef = useRef('');

  const clearTimers = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, []);

  // Load last server address on mount
  useEffect(() => {
    void getLastServer().then((addr) => {
      if (addr) setServerAddress(addr);
    });
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // Register socket callbacks
  useEffect(() => {
    socketService.setCallbacks({
      onConnectionChange: (state) => {
        setConnectionState(state);
        connectionStateRef.current = state;
        if (state === 'error') {
          setErrorMessage(t('pairing.pairErrConnection'));
          clearTimers();
        }
      },
      onPairConfirm: (deviceName) => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        clearTimers();
        setConnectionState('connected');
        connectionStateRef.current = 'connected';
        const addrToSave = activeAddressRef.current || serverAddress;
        void saveLastServer(addrToSave);
        Alert.alert(t('common.success'), t('pairing.connectSuccess', { deviceName }));
        navigation.replace('RemoteControl', { serverAddress: addrToSave, deviceName });
      },
      onError: (error) => {
        clearTimers();
        setErrorMessage(error);
      },
    });
  }, [navigation, clearTimers, serverAddress, t]);

  // Standard Wi-Fi / Cloud connection logic
  const handleConnect = useCallback(() => {
    setErrorMessage(null);
    Keyboard.dismiss();
    clearTimers();

    if (
      connectionStateRef.current === 'connecting' ||
      connectionStateRef.current === 'pairing' ||
      connectionStateRef.current === 'connected'
    ) {
      return;
    }

    if (!pairingCode.trim() || pairingCode.length < PAIRING_CODE_LENGTH) {
      setErrorMessage(t('pairing.pairingCodeLengthErr', { length: PAIRING_CODE_LENGTH }));
      return;
    }

    const code = pairingCode.toUpperCase().trim();

    setConnectionState('connecting');
    connectionStateRef.current = 'connecting';

    const discoverAndConnect = async () => {
      let addressesToTry: string[] = [];
      let isManualAddress = false;
      if (!serverAddress.trim()) {
        if (!CLOUD_DISCOVERY_API_KEY) {
          throw new Error(t('pairing.pairErrApiKeyMissing'));
        }
        try {
          const res = await fetch(`${CLOUD_DISCOVERY_API_URL}/${CLOUD_DISCOVERY_API_KEY}/${code}`);
          const dataText = await res.text();
          const cleanedData = dataText.replace(/^"|"$/g, '').trim();

          if (!cleanedData) {
            throw new Error(t('pairing.pairErrNoComputer'));
          }

          const parts = cleanedData.split('_');
          if (parts.length < 2) {
            throw new Error(t('pairing.pairErrCloudFail'));
          }

          const port = parts[parts.length - 1];
          const rawIps = parts.slice(0, parts.length - 1);
          addressesToTry = rawIps
            .map((ip) => ip.replace(/-/g, '.'))
            .filter((ip) => ip !== '127.0.0.1' && ip !== 'localhost' && ip !== '::1')
            .map((ip) => `http://${ip}:${port}`);
        } catch (e: unknown) {
          console.info('Auto discovery fetch failed. Proceeding with fallback candidates.');
          const message = e instanceof Error ? e.message : String(e);
          if (
            message === t('pairing.pairErrNoComputer') ||
            message === t('pairing.pairErrCloudFail')
          ) {
            throw e;
          }
          addressesToTry = [];
        }
      } else {
        const address = serverAddress.includes('://') ? serverAddress : `http://${serverAddress}`;
        const fullAddress = address.includes(':') ? address : `${address}:8080`;
        addressesToTry = [fullAddress];
        isManualAddress = true;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const pingPromises = addressesToTry.map(async (url) => {
          try {
            const res = await fetch(`${url}/health`, { signal: controller.signal });
            if (res.status === 200) {
              const data = await res.json();
              if (data.status === 'ok') {
                return { url, pairingCode: data.pairingCode || code };
              }
            }
          } catch (err) {
            console.warn('[PairingScreen] Error:', err);
          }
          throw new Error('Failed');
        });

        let firstSuccess;
        try {
          if (pingPromises.length === 0) {
            throw new Error('No local IP addresses to try');
          }
          firstSuccess = await new Promise<{ url: string; pairingCode: string }>(
            (resolve, reject) => {
              let rejectedCount = 0;
              pingPromises.forEach((p) => {
                p.then(resolve).catch(() => {
                  rejectedCount++;
                  if (rejectedCount === pingPromises.length) {
                    reject(new Error('All local pings failed'));
                  }
                });
              });
            },
          );
        } catch (fallbackError) {
          if (isManualAddress) {
            throw new Error(t('pairing.pairErrConnection'));
          }
          throw new Error(t('pairing.pairErrLanPingFail'));
        }

        clearTimeout(timeoutId);

        const savedAddr = firstSuccess.url.replace('http://', '').replace('https://', '');
        setServerAddress(savedAddr);
        activeAddressRef.current = savedAddr;

        socketService.connect(firstSuccess.url);

        checkIntervalRef.current = setInterval(() => {
          if (socketService.isSocketConnected) {
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
            void getDeviceId().then((dId) => {
              socketService.sendPairingCode(firstSuccess.pairingCode, dId || undefined);
            });
          }
        }, 200);

        timeoutRef.current = setTimeout(() => {
          clearTimers();
          if (
            connectionStateRef.current === 'connecting' ||
            connectionStateRef.current === 'pairing'
          ) {
            const wasSocketConnected = socketService.isSocketConnected;
            socketService.disconnect();
            setConnectionState('error');
            if (wasSocketConnected) {
              setErrorMessage(t('pairing.pairErrBtFail'));
            } else {
              setErrorMessage(t('pairing.pairErrSocket'));
            }
          }
        }, 10000);
      } catch (err: unknown) {
        clearTimers();
        setConnectionState('error');
        setErrorMessage(err instanceof Error ? err.message : t('pairing.pairErrBtFindFail'));
      }
    };

    void discoverAndConnect();
  }, [pairingCode, serverAddress, t, clearTimers]);

  // Bluetooth scanning flow
  const handleScanBluetooth = useCallback(async () => {
    setErrorMessage(null);
    setIsScanningBt(true);
    setBtDevices([]);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    try {
      if (bluetoothService.isModuleAvailable) {
        const hasPermission = await bluetoothService.requestPermissions();
        if (!hasPermission) {
          throw new Error(t('pairing.pairErrBtPermission'));
        }

        const success = await bluetoothService.startDiscovery((devices) => {
          setBtDevices(devices);
        });

        if (!success) {
          throw new Error(t('pairing.pairErrBtStart'));
        }

        // Stop scanning after 8s
        scanTimeoutRef.current = setTimeout(() => {
          void bluetoothService.stopDiscovery();
          setIsScanningBt(false);
          scanTimeoutRef.current = null;
        }, 8000);
      } else {
        // Fallback: Virtual/Simulated Bluetooth scanner
        scanTimeoutRef.current = setTimeout(() => {
          const mockDevices: BluetoothDevice[] = [
            { address: 'VIRTUAL-01', name: 'PC-GHITA (Auto Bluetooth/Cloud)', bonded: true },
            { address: 'VIRTUAL-02', name: 'DESKTOP-TAURI (Auto Bluetooth/Cloud)', bonded: false },
          ];
          setBtDevices(mockDevices);
          setIsScanningBt(false);
          scanTimeoutRef.current = null;
        }, 1500);
      }
    } catch (err: unknown) {
      setIsScanningBt(false);
      setErrorMessage(err instanceof Error ? err.message : t('pairing.pairErrBtStart'));
    }
  }, [t]);

  // Connect to a Bluetooth device
  const handleConnectBtDevice = useCallback(
    async (device: BluetoothDevice) => {
      setErrorMessage(null);
      clearTimers();
      setConnectionState('connecting');
      connectionStateRef.current = 'connecting';

      // Stop UI and background scanning
      setIsScanningBt(false);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      void bluetoothService.stopDiscovery();

      try {
        let resolvedAddress: string | null = null;
        let remotePairingCode: string | null = null;

        // 1. If it's a real Bluetooth device, try RFCOMM
        if (bluetoothService.isModuleAvailable && !device.address.startsWith('VIRTUAL-')) {
          resolvedAddress = await bluetoothService.connectToDevice(device);
        }

        // 2. Resolve via Hostname Cloud Registry
        if (!resolvedAddress) {
          const cleanName = device.name
            .replace(/\s*\(.*?\)/g, '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9-]/g, '');

          if (!cleanName) {
            throw new Error(t('pairing.pairErrInvalidName'));
          }

          if (!CLOUD_DISCOVERY_API_KEY) throw new Error(t('pairing.pairErrApiKeyMissing'));
          const res = await fetch(
            `${CLOUD_DISCOVERY_API_URL}/${CLOUD_DISCOVERY_API_KEY}/${cleanName}`,
          );
          const dataText = await res.text();
          const cleanedData = dataText.replace(/^"|"$/g, '').trim();

          if (!cleanedData) {
            throw new Error(t('pairing.pairErrNoIpCloud', { name: cleanName }));
          }

          const parts = cleanedData.split('_');
          if (parts.length < 2) {
            throw new Error(t('pairing.pairErrCloudPcFail'));
          }

          const port = parts[parts.length - 1];
          const rawIps = parts.slice(0, parts.length - 1);
          const addressesToTry = rawIps
            .map((ip) => ip.replace(/-/g, '.'))
            .filter((ip) => ip !== '127.0.0.1' && ip !== 'localhost' && ip !== '::1')
            .map((ip) => `http://${ip}:${port}`);

          // Ping IP candidates
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          const pingPromises = addressesToTry.map(async (url) => {
            try {
              const res = await fetch(`${url}/health`, { signal: controller.signal });
              if (res.status === 200) {
                const data = await res.json();
                if (data.status === 'ok') {
                  return { url, pairingCode: data.pairingCode };
                }
              }
            } catch (err) {
              console.warn('[PairingScreen] Error:', err);
            }
            throw new Error('Failed');
          });

          const successObj = await new Promise<{ url: string; pairingCode: string }>(
            (resolve, reject) => {
              let rejectedCount = 0;
              pingPromises.forEach((p) => {
                p.then(resolve).catch(() => {
                  rejectedCount++;
                  if (rejectedCount === pingPromises.length) {
                    reject(new Error(t('pairing.pairErrLanPingFail')));
                  }
                });
              });
            },
          );

          clearTimeout(timeoutId);
          resolvedAddress = successObj.url;
          remotePairingCode = successObj.pairingCode;
        }

        if (!resolvedAddress) {
          throw new Error(t('pairing.pairErrNoIp'));
        }

        if (!remotePairingCode) {
          try {
            const res = await fetch(`${resolvedAddress}/health`);
            const data = await res.json();
            remotePairingCode = data.pairingCode;
          } catch {
            // Ignore
          }
        }

        if (!remotePairingCode) {
          throw new Error(t('pairing.noCodeFromServer'));
        }

        const pairingCodeToUse = remotePairingCode;

        const savedAddr = resolvedAddress.replace('http://', '');
        setServerAddress(savedAddr);
        activeAddressRef.current = savedAddr;

        socketService.connect(resolvedAddress);

        checkIntervalRef.current = setInterval(() => {
          if (socketService.isSocketConnected) {
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
            void getDeviceId().then((dId) => {
              socketService.sendPairingCode(pairingCodeToUse, dId || undefined);
            });
          }
        }, 200);

        timeoutRef.current = setTimeout(() => {
          clearTimers();
          if (
            connectionStateRef.current === 'connecting' ||
            connectionStateRef.current === 'pairing'
          ) {
            const wasSocketConnected = socketService.isSocketConnected;
            socketService.disconnect();
            setConnectionState('error');
            if (wasSocketConnected) {
              setErrorMessage(t('pairing.pairErrBtFail'));
            } else {
              setErrorMessage(t('pairing.pairErrSocket'));
            }
          }
        }, 10000);
      } catch (err: unknown) {
        clearTimers();
        setConnectionState('error');
        setErrorMessage(err instanceof Error ? err.message : t('pairing.pairErrBtFindFail'));
      }
    },
    [clearTimers, t],
  );

  // Connect using manual hostname input
  const handleConnectByManualName = useCallback(() => {
    if (!manualPcName.trim()) {
      setErrorMessage(t('pairing.pairErrInvalidName'));
      return;
    }
    const dev: BluetoothDevice = {
      address: 'VIRTUAL-MANUAL',
      name: manualPcName.toUpperCase().trim(),
    };
    void handleConnectBtDevice(dev);
  }, [manualPcName, handleConnectBtDevice, t]);

  // Automatically start Bluetooth scanning when tab switches to Bluetooth
  useEffect(() => {
    if (activeTab === 'bluetooth') {
      void handleScanBluetooth();
    }
  }, [activeTab, handleScanBluetooth]);

  const isConnecting = connectionState === 'connecting' || connectionState === 'pairing';
  const wifiInstructions = t('pairing.wifiInstructions');
  const btInstructions = t('pairing.btInstructions');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.logoText}>{t('pairing.title')}</Text>
              <Text style={styles.subtitle}>{t('pairing.subtitle')}</Text>
            </View>

            <ConnectionStatus state={connectionState} />

            {/* Tab Selector */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'wifi' && styles.tabButtonActive]}
                onPress={() => setActiveTab('wifi')}
                accessibilityLabel={t('pairing.wifiTab')}
              >
                <Text
                  style={[styles.tabButtonText, activeTab === 'wifi' && styles.tabButtonTextActive]}
                >
                  {t('pairing.wifiTab')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'bluetooth' && styles.tabButtonActive]}
                onPress={() => setActiveTab('bluetooth')}
                accessibilityLabel={t('pairing.bluetoothTab')}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'bluetooth' && styles.tabButtonTextActive,
                  ]}
                >
                  {t('pairing.bluetoothTab')}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
              {activeTab === 'wifi' ? (
                <View style={styles.form}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('pairing.ipLabel')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('pairing.ipPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      value={serverAddress}
                      onChangeText={setServerAddress}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      returnKeyType="next"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('pairing.codeLabel')}</Text>
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      placeholder={t('pairing.codePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      value={pairingCode}
                      onChangeText={(val) =>
                        setPairingCode(val.toUpperCase().slice(0, PAIRING_CODE_LENGTH))
                      }
                      maxLength={PAIRING_CODE_LENGTH}
                      autoCapitalize="characters"
                      returnKeyType="go"
                      onSubmitEditing={handleConnect}
                    />
                  </View>

                  {errorMessage && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
                    onPress={handleConnect}
                    disabled={isConnecting}
                    accessibilityLabel={t('pairing.connectBtn')}
                  >
                    {isConnecting ? (
                      <ActivityIndicator color={colors.textPrimary} />
                    ) : (
                      <Text style={styles.connectButtonText}>{t('pairing.connectBtn')}</Text>
                    )}
                  </TouchableOpacity>

                  {/* Instructions */}
                  <View style={styles.instructions}>
                    <Text style={styles.instructionTitle}>
                      {t('pairing.wifiInstructionsTitle')}
                    </Text>
                    {Array.isArray(wifiInstructions) &&
                      wifiInstructions.map((inst: string, index: number) => (
                        <Text key={index} style={styles.instructionText}>
                          {inst}
                        </Text>
                      ))}
                  </View>
                </View>
              ) : (
                <View style={styles.form}>
                  {/* Manual PC Hostname Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('pairing.manualNameLabel')}</Text>
                    <View style={styles.manualNameRow}>
                      <TextInput
                        style={[styles.input, styles.manualNameInput]}
                        placeholder={t('pairing.manualNamePlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        value={manualPcName}
                        onChangeText={setManualPcName}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        returnKeyType="done"
                      />
                      <TouchableOpacity
                        style={styles.manualNameButton}
                        onPress={handleConnectByManualName}
                        disabled={isConnecting}
                      >
                        <Text style={styles.manualNameButtonText}>{t('pairing.connectBtn')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Bluetooth Device List */}
                  <View style={styles.deviceListContainer}>
                    <View style={styles.deviceListHeader}>
                      <Text style={styles.label}>{t('pairing.btDevicesHeader')}</Text>
                      {isScanningBt ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <TouchableOpacity
                          onPress={handleScanBluetooth}
                          style={styles.rescanBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.scanActionText}>{t('pairing.btRescan')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {btDevices.length === 0 ? (
                      <View style={styles.emptyDeviceContainer}>
                        <Text style={styles.emptyDeviceText}>
                          {isScanningBt
                            ? t('pairing.btNoDevicesScanning')
                            : t('pairing.btNoDevicesRescan')}
                        </Text>
                      </View>
                    ) : (
                      <FlatList
                        data={btDevices}
                        keyExtractor={(item, index) => `${item.address}-${index}`}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={styles.deviceItem}
                            onPress={() => handleConnectBtDevice(item)}
                            disabled={isConnecting}
                          >
                            <View style={styles.deviceInfo}>
                              <Text style={styles.deviceName}>{item.name}</Text>
                              <Text style={styles.deviceAddress}>
                                {item.bonded ? t('pairing.btBonded') : t('pairing.btNewDevice')} •{' '}
                                {item.address}
                              </Text>
                            </View>
                            <Text style={styles.connectDeviceAction}>
                              {t('pairing.connectBtn')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      />
                    )}
                  </View>

                  {errorMessage && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  )}

                  {/* Instructions */}
                  <View style={styles.instructions}>
                    <Text style={styles.instructionTitle}>{t('pairing.btInstructionsTitle')}</Text>
                    {Array.isArray(btInstructions) &&
                      btInstructions.map((inst: string, index: number) => (
                        <Text key={index} style={styles.instructionText}>
                          {inst}
                        </Text>
                      ))}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  logoText: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 4,
  },
  subtitle: { fontSize: FontSize.md, color: colors.textMuted, marginTop: Spacing.sm },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: Radius.md,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonText: {
    fontSize: FontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  formContainer: { flex: 1 },
  form: { marginBottom: Spacing.xl },
  inputGroup: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    color: colors.textSecondary,
    marginBottom: Spacing.xs,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: colors.textPrimary,
  },
  codeInput: { fontSize: FontSize.xl, letterSpacing: 4, textAlign: 'center', fontWeight: '700' },
  errorContainer: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: '#ef4444', fontSize: FontSize.sm },
  connectButton: {
    backgroundColor: colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  connectButtonDisabled: { opacity: 0.6 },
  connectButtonText: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  instructions: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  instructionTitle: {
    color: colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  instructionText: { color: colors.textMuted, fontSize: FontSize.sm, lineHeight: 20 },

  // Bluetooth specific styles
  manualNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualNameInput: {
    flex: 1,
  },
  manualNameButton: {
    backgroundColor: colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualNameButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  deviceListContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  rescanBtn: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanActionText: {
    color: colors.accent,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  emptyDeviceContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyDeviceText: {
    color: colors.textMuted,
    fontSize: FontSize.sm,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  deviceAddress: {
    fontSize: FontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  connectDeviceAction: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: FontSize.sm,
    marginLeft: 8,
  },
});
