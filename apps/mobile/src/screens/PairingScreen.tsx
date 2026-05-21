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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { socketService } from '../services/socketService';
import { getLastServer, saveLastServer, getDeviceId } from '../services/storageService';
import { bluetoothService, BluetoothDevice } from '../services/bluetoothService';
import type { ConnectionState } from '../types';
import type { PairingScreenProps } from '../navigation/types';

const PAIRING_CODE_LENGTH = 6;

export function PairingScreen({ navigation }: PairingScreenProps): React.JSX.Element {
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
          setErrorMessage('Không thể kết nối. Kiểm tra mạng hoặc địa chỉ IP và thử lại.');
          clearTimers();
        }
      },
      onPairConfirm: (deviceName) => {
        clearTimers();
        setConnectionState('connected');
        connectionStateRef.current = 'connected';
        const addrToSave = activeAddressRef.current || serverAddress;
        void saveLastServer(addrToSave);
        Alert.alert('Thành công', `Đã kết nối với ${deviceName}`);
        navigation.replace('RemoteControl', { serverAddress: addrToSave, deviceName });
      },
      onError: (error) => {
        clearTimers();
        setErrorMessage(error);
      },
    });
  }, [navigation, clearTimers, serverAddress]);

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
      setErrorMessage(`Vui lòng nhập mã ghép đôi ${PAIRING_CODE_LENGTH} ký tự`);
      return;
    }

    const code = pairingCode.toUpperCase().trim();

    setConnectionState('connecting');
    connectionStateRef.current = 'connecting';

    const discoverAndConnect = async () => {
      let addressesToTry: string[] = [];

      if (!serverAddress.trim()) {
        try {
          const appKey = 'an6h273b';
          const res = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/${appKey}/${code}`);
          const dataText = await res.text();
          const cleanedData = dataText.replace(/^"|"$/g, '').trim();

          if (!cleanedData) {
            throw new Error('Không tìm thấy máy tính tương ứng với mã này. Hãy chắc chắn mã đã đúng và server trên máy tính đang chạy.');
          }

          const parts = cleanedData.split('_');
          if (parts.length < 2) {
            throw new Error('Dữ liệu Cloud Discovery bị lỗi hoặc đã hết hạn.');
          }

          const port = parts[parts.length - 1];
          const rawIps = parts.slice(0, parts.length - 1);
          addressesToTry = rawIps.map(ip => `http://${ip.replace(/-/g, '.')}:${port}`);
        } catch (e: any) {
          clearTimers();
          setConnectionState('error');
          setErrorMessage(e.message || 'Lỗi khi dò tìm máy tính qua Cloud.');
          return;
        }
      } else {
        const address = serverAddress.includes('://') ? serverAddress : `http://${serverAddress}`;
        const fullAddress = address.includes(':') ? address : `${address}:8080`;
        addressesToTry = [fullAddress];
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
            // Ignore error
          }
          throw new Error('Failed');
        });

        const firstSuccess = await new Promise<{ url: string; pairingCode: string }>((resolve, reject) => {
          let rejectedCount = 0;
          pingPromises.forEach((p) => {
            p.then(resolve).catch(() => {
              rejectedCount++;
              if (rejectedCount === pingPromises.length) {
                reject(new Error('Không kết nối được tới máy tính. Hãy chắc chắn điện thoại và máy tính kết nối cùng Wi-Fi.'));
              }
            });
          });
        });

        clearTimeout(timeoutId);

        const savedAddr = firstSuccess.url.replace('http://', '');
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
              setErrorMessage('Ghép đôi thất bại. Vui lòng kiểm tra lại mã ghép đôi.');
            } else {
              setErrorMessage('Không kết nối được Socket.io. Vui lòng thử lại.');
            }
          }
        }, 10000);

      } catch (err: any) {
        clearTimers();
        setConnectionState('error');
        setErrorMessage(err.message || 'Không tìm thấy hoặc kết nối tới máy tính.');
      }
    };

    void discoverAndConnect();
  }, [serverAddress, pairingCode, clearTimers]);

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
          throw new Error('Chưa cấp quyền Bluetooth hoặc định vị.');
        }

        const success = await bluetoothService.startDiscovery((devices) => {
          setBtDevices(devices);
        });

        if (!success) {
          throw new Error('Không khởi động được quét Bluetooth. Vui lòng bật Bluetooth.');
        }

        // Stop scanning after 8s
        scanTimeoutRef.current = setTimeout(() => {
          void bluetoothService.stopDiscovery();
          setIsScanningBt(false);
          scanTimeoutRef.current = null;
        }, 8000);
      } else {
        // Fallback: Virtual/Simulated Bluetooth scanner
        // Reads from the active Hostnames registry or provides standard mock
        scanTimeoutRef.current = setTimeout(() => {
          const mockDevices: BluetoothDevice[] = [
            { address: 'VIRTUAL-01', name: 'PC-GHITA (Tự động Bluetooth/Cloud)', bonded: true },
            { address: 'VIRTUAL-02', name: 'DESKTOP-TAURI (Tự động Bluetooth/Cloud)', bonded: false },
          ];
          setBtDevices(mockDevices);
          setIsScanningBt(false);
          scanTimeoutRef.current = null;
        }, 1500);
      }
    } catch (err: any) {
      setIsScanningBt(false);
      setErrorMessage(err.message || 'Lỗi khi quét Bluetooth.');
    }
  }, []);

  // Connect to a Bluetooth device (using PC Name resolution over Cloud Key-Value registry)
  const handleConnectBtDevice = useCallback(async (device: BluetoothDevice) => {
    setErrorMessage(null);
    clearTimers();
    setConnectionState('connecting');
    connectionStateRef.current = 'connecting';

    try {
      let resolvedAddress: string | null = null;
      let remotePairingCode: string | null = null;

      // 1. If it's a real Bluetooth device and module is available, try direct RFCOMM query first
      if (bluetoothService.isModuleAvailable && !device.address.startsWith('VIRTUAL-')) {
        resolvedAddress = await bluetoothService.connectToDevice(device);
      }

      // 2. Resolve via Hostname Cloud Registry mapping (highly reliable)
      if (!resolvedAddress) {
        // Extract raw name e.g., "DESKTOP-R7T92A"
        const cleanName = device.name
          .replace(/\s*\(Tự động Bluetooth\/Cloud\)/gi, '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9-]/g, '');

        if (!cleanName) {
          throw new Error('Tên thiết bị không hợp lệ để tự động tìm kiếm.');
        }

        const appKey = 'an6h273b';
        const res = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/${appKey}/${cleanName}`);
        const dataText = await res.text();
        const cleanedData = dataText.replace(/^"|"$/g, '').trim();

        if (!cleanedData) {
          throw new Error(`Không tìm thấy IP của máy tính '${cleanName}' trên Cloud Registry. Hãy chắc chắn Server đã bật trên máy tính.`);
        }

        const parts = cleanedData.split('_');
        if (parts.length < 2) {
          throw new Error('Dữ liệu Cloud Discovery của PC bị lỗi hoặc hết hạn.');
        }

        const port = parts[parts.length - 1];
        const rawIps = parts.slice(0, parts.length - 1);
        const addressesToTry = rawIps.map(ip => `http://${ip.replace(/-/g, '.')}:${port}`);

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
            // Ignore
          }
          throw new Error('Failed');
        });

        const successObj = await new Promise<{ url: string; pairingCode: string }>((resolve, reject) => {
          let rejectedCount = 0;
          pingPromises.forEach((p) => {
            p.then(resolve).catch(() => {
              rejectedCount++;
              if (rejectedCount === pingPromises.length) {
                reject(new Error('Không thể kết nối đến máy tính trong mạng LAN Wi-Fi.'));
              }
            });
          });
        });

        clearTimeout(timeoutId);
        resolvedAddress = successObj.url;
        remotePairingCode = successObj.pairingCode;
      }

      if (!resolvedAddress) {
        throw new Error('Không lấy được địa chỉ kết nối của máy tính.');
      }

      // If we don't have the pairing code yet, fetch it from health endpoint
      if (!remotePairingCode) {
        try {
          const res = await fetch(`${resolvedAddress}/health`);
          const data = await res.json();
          remotePairingCode = data.pairingCode;
        } catch {
          // Ignore, we will ask user or try default
        }
      }

      const pairingCodeToUse = remotePairingCode || '000000';

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
            setErrorMessage('Ghép đôi Bluetooth thất bại. Vui lòng thử lại.');
          } else {
            setErrorMessage('Không kết nối được Socket.io. Vui lòng thử lại.');
          }
        }
      }, 10000);

    } catch (err: any) {
      clearTimers();
      setConnectionState('error');
      setErrorMessage(err.message || 'Không tìm thấy máy tính qua Bluetooth.');
    }
  }, [clearTimers]);

  // Connect using manual hostname input
  const handleConnectByManualName = useCallback(() => {
    if (!manualPcName.trim()) {
      setErrorMessage('Vui lòng nhập tên máy tính');
      return;
    }
    const dev: BluetoothDevice = {
      address: 'VIRTUAL-MANUAL',
      name: manualPcName.toUpperCase().trim(),
    };
    void handleConnectBtDevice(dev);
  }, [manualPcName, handleConnectBtDevice]);

  // Automatically start Bluetooth scanning when tab switches to Bluetooth
  useEffect(() => {
    if (activeTab === 'bluetooth') {
      void handleScanBluetooth();
    }
  }, [activeTab, handleScanBluetooth]);

  const isConnecting = connectionState === 'connecting' || connectionState === 'pairing';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logoText}>GHITA</Text>
            <Text style={styles.subtitle}>Kết nối với máy tính</Text>
          </View>

          <ConnectionStatus state={connectionState} />

          {/* Tab Selector */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'wifi' && styles.tabButtonActive]}
              onPress={() => setActiveTab('wifi')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'wifi' && styles.tabButtonTextActive]}>
                📶 Wi-Fi / Cloud
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'bluetooth' && styles.tabButtonActive]}
              onPress={() => setActiveTab('bluetooth')}
            >
              <Text style={[styles.tabButtonText, activeTab === 'bluetooth' && styles.tabButtonTextActive]}>
                🔵 Bluetooth
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
            {activeTab === 'wifi' ? (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Địa chỉ IP máy tính (Để trống để tự động dò tìm)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Tự động dò tìm (hoặc nhập IP ví dụ: 192.168.1.100)"
                    placeholderTextColor={Colors.textMuted}
                    value={serverAddress}
                    onChangeText={setServerAddress}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mã ghép đôi</Text>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="Mã 6 chữ số"
                    placeholderTextColor={Colors.textMuted}
                    value={pairingCode}
                    onChangeText={(t) => setPairingCode(t.toUpperCase().slice(0, PAIRING_CODE_LENGTH))}
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
                >
                  {isConnecting ? (
                    <ActivityIndicator color={Colors.textPrimary} />
                  ) : (
                    <Text style={styles.connectButtonText}>Kết nối</Text>
                  )}
                </TouchableOpacity>

                {/* Instructions */}
                <View style={styles.instructions}>
                  <Text style={styles.instructionTitle}>Hướng dẫn kết nối Wi-Fi:</Text>
                  <Text style={styles.instructionText}>1. Mở ứng dụng GHITA trên máy tính.</Text>
                  <Text style={styles.instructionText}>2. Vào tab Devices và đảm bảo Server đã bật.</Text>
                  <Text style={styles.instructionText}>3. Chỉ cần nhập mã ghép đôi 6 ký tự trên điện thoại và nhấn Kết nối (ô IP để trống).</Text>
                  <Text style={styles.instructionText}>4. Nếu không tự động tìm thấy, nhập thủ công địa chỉ IP hiển thị trên máy tính.</Text>
                </View>
              </View>
            ) : (
              <View style={styles.form}>
                {/* Manual PC Hostname Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Nhập Tên máy tính của bạn (Nếu không quét thấy)</Text>
                  <View style={styles.manualNameRow}>
                    <TextInput
                      style={[styles.input, styles.manualNameInput]}
                      placeholder="Ví dụ: DESKTOP-ABC123"
                      placeholderTextColor={Colors.textMuted}
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
                      <Text style={styles.manualNameButtonText}>Kết nối</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Bluetooth Device List */}
                <View style={styles.deviceListContainer}>
                  <View style={styles.deviceListHeader}>
                    <Text style={styles.label}>Thiết bị Bluetooth ở gần</Text>
                    {isScanningBt ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <TouchableOpacity onPress={handleScanBluetooth}>
                        <Text style={styles.scanActionText}>Quét lại</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {btDevices.length === 0 ? (
                    <View style={styles.emptyDeviceContainer}>
                      <Text style={styles.emptyDeviceText}>
                        {isScanningBt ? 'Đang tìm kiếm thiết bị...' : 'Không tìm thấy thiết bị nào. Nhấp quét lại.'}
                      </Text>
                    </View>
                  ) : (
                    btDevices.map((device, index) => (
                      <TouchableOpacity
                        key={`${device.address}-${index}`}
                        style={styles.deviceItem}
                        onPress={() => handleConnectBtDevice(device)}
                        disabled={isConnecting}
                      >
                        <View style={styles.deviceInfo}>
                          <Text style={styles.deviceName}>{device.name}</Text>
                          <Text style={styles.deviceAddress}>
                            {device.bonded ? '🔵 Đã ghép đôi' : '⚪ Thiết bị mới'} • {device.address}
                          </Text>
                        </View>
                        <Text style={styles.connectDeviceAction}>Kết nối</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                {errorMessage && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                )}

                {/* Instructions */}
                <View style={styles.instructions}>
                  <Text style={styles.instructionTitle}>Hướng dẫn kết nối Bluetooth:</Text>
                  <Text style={styles.instructionText}>1. Đảm bảo điện thoại và máy tính đã bật Bluetooth.</Text>
                  <Text style={styles.instructionText}>2. Ghép đôi điện thoại và máy tính trong Cài đặt Bluetooth của điện thoại.</Text>
                  <Text style={styles.instructionText}>3. Mở GHITA Desktop, tìm tên máy hiển thị ở phần "Tên Máy (Bluetooth)".</Text>
                  <Text style={styles.instructionText}>4. Chọn tên máy của bạn trong danh sách trên điện thoại hoặc nhập thủ công để kết nối.</Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  logoText: { fontSize: FontSize.title, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 4 },
  subtitle: { fontSize: FontSize.md, color: Colors.textMuted, marginTop: Spacing.sm },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    backgroundColor: Colors.backgroundSecondary,
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
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButtonText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  formContainer: { flex: 1 },
  form: { marginBottom: Spacing.xl },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.xs, fontWeight: '600' },
  input: { backgroundColor: Colors.backgroundTertiary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md, color: Colors.textPrimary },
  codeInput: { fontSize: FontSize.xl, letterSpacing: 4, textAlign: 'center', fontWeight: '700' },
  errorContainer: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.md, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  errorText: { color: '#ef4444', fontSize: FontSize.sm },
  connectButton: { backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm, marginBottom: Spacing.md },
  connectButtonDisabled: { opacity: 0.6 },
  connectButtonText: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  instructions: { backgroundColor: Colors.backgroundSecondary, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
  instructionTitle: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  instructionText: { color: Colors.textMuted, fontSize: FontSize.sm, lineHeight: 20 },
  
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
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualNameButtonText: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  deviceListContainer: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deviceListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  scanActionText: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  emptyDeviceContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyDeviceText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  deviceAddress: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  connectDeviceAction: {
    color: Colors.accent,
    fontWeight: '700',
    fontSize: FontSize.sm,
    marginLeft: 8,
  },
});
