// ==============================================================================
// GHITA CODING AGENT — Pairing Screen
// Enter pairing code to connect to desktop app
// ==============================================================================

import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { socketService } from '../services/socketService';
import { getLastServer, saveLastServer } from '../services/storageService';
import type { ConnectionState } from '../types';
import type { PairingScreenProps } from '../navigation/types';

const PAIRING_CODE_LENGTH = 6;

export function PairingScreen({ navigation }: PairingScreenProps): React.JSX.Element {
  const [pairingCode, setPairingCode] = useState('');
  const [serverAddress, setServerAddress] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load last server address on mount
  useEffect(() => {
    void getLastServer().then((addr) => {
      if (addr) setServerAddress(addr);
    });
  }, []);

  // Register socket callbacks
  useEffect(() => {
    socketService.setCallbacks({
      onConnectionChange: (state) => {
        setConnectionState(state);
        if (state === 'error') {
          setErrorMessage('Không thể kết nối. Kiểm tra địa chỉ IP và thử lại.');
        }
      },
      onPairConfirm: (deviceName) => {
        setErrorMessage(null);
        void saveLastServer(serverAddress);
        navigation.replace('RemoteControl', {
          serverAddress,
          deviceName,
        });
      },
      onError: (error) => {
        setErrorMessage(error);
        setConnectionState('error');
      },
    });

    return () => {
      // Cleanup callbacks on unmount (don't disconnect — we might navigate)
      socketService.setCallbacks({});
    };
  }, [navigation, serverAddress]);

  // Handle pairing code input — auto uppercase, max length
  const handleCodeChange = useCallback((text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length <= PAIRING_CODE_LENGTH) {
      setPairingCode(cleaned);
      setErrorMessage(null);
    }
  }, []);

  // Handle connect
  const handleConnect = useCallback(() => {
    Keyboard.dismiss();

    // Validate server address
    const address = serverAddress.trim();
    if (!address) {
      setErrorMessage('Vui lòng nhập địa chỉ IP máy tính');
      return;
    }

    // Validate pairing code
    if (pairingCode.length !== PAIRING_CODE_LENGTH) {
      setErrorMessage(`Mã ghép đôi phải có ${PAIRING_CODE_LENGTH} ký tự`);
      return;
    }

    setErrorMessage(null);

    // Format address with protocol if missing
    let fullAddress = address;
    if (!fullAddress.startsWith('http://') && !fullAddress.startsWith('https://')) {
      fullAddress = `http://${fullAddress}`;
    }
    // Add default port if not specified
    if (!fullAddress.match(/:\d+$/)) {
      fullAddress = `${fullAddress}:8080`;
    }

    setServerAddress(fullAddress);

    // Connect first, then wait for connection before sending pairing code
    // This fixes the race condition where sendPairingCode was called before socket connected
    socketService.setCallbacks({
      ...socketService,
      onConnectionChange: (state) => {
        setConnectionState(state);
        if (state === 'connected') {
          // Socket is now connected — safe to send pairing code
          socketService.sendPairingCode(pairingCode);
        }
        if (state === 'error') {
          setErrorMessage('Không thể kết nối. Kiểm tra địa chỉ IP và thử lại.');
        }
      },
      onPairConfirm: (deviceName) => {
        setErrorMessage(null);
        void saveLastServer(fullAddress);
        navigation.replace('RemoteControl', {
          serverAddress: fullAddress,
          deviceName,
        });
      },
      onError: (error) => {
        setErrorMessage(error);
        setConnectionState('error');
      },
    });

    socketService.connect(fullAddress);
  }, [serverAddress, pairingCode, navigation]);

  const isConnecting = connectionState === 'connecting' || connectionState === 'pairing';

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🤖</Text>
          <Text style={styles.title}>AI Agent Remote</Text>
          <Text style={styles.subtitle}>Kết nối để điều khiển máy tính từ xa</Text>
        </View>

        {/* Connection Status */}
        <View style={styles.statusRow}>
          <ConnectionStatus state={connectionState} />
        </View>

        {/* Server Address Input */}
        <View style={styles.section}>
          <Text style={styles.label}>📶 Địa chỉ IP máy tính</Text>
          <TextInput
            style={styles.serverInput}
            value={serverAddress}
            onChangeText={(text) => {
              setServerAddress(text);
              setErrorMessage(null);
            }}
            placeholder="192.168.1.100:8080"
            placeholderTextColor={Colors.textDark}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isConnecting}
          />
        </View>

        {/* Pairing Code Input */}
        <View style={styles.section}>
          <Text style={styles.label}>🔐 Ghép đôi thiết bị</Text>
          <TextInput
            style={styles.codeInput}
            value={pairingCode}
            onChangeText={handleCodeChange}
            placeholder="Nhập mã từ máy tính"
            placeholderTextColor={Colors.textDark}
            maxLength={PAIRING_CODE_LENGTH}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isConnecting}
          />
        </View>

        {/* Error Message */}
        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {errorMessage}</Text>
          </View>
        )}

        {/* Connect Button */}
        <TouchableOpacity
          style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
          onPress={handleConnect}
          disabled={isConnecting}
          activeOpacity={0.8}
          accessibilityLabel="Kết nối"
          accessibilityRole="button"
        >
          <Text style={styles.connectButtonText}>
            {isConnecting ? 'Đang kết nối...' : 'Kết nối'}
          </Text>
        </TouchableOpacity>

        {/* QR Code option */}
        <Text style={styles.qrHint}>Hoặc quét QR code</Text>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>GHITA CODING AGENT v0.1.0</Text>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.huge,
    marginBottom: Spacing.xxl,
  },
  logo: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.primaryLight,
    fontSize: FontSize.title,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  statusRow: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: {
    color: Colors.primaryLight,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  serverInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  codeInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: Colors.errorMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  connectButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  qrHint: {
    color: Colors.textDark,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: Spacing.xl,
  },
  footerText: {
    color: Colors.textDark,
    fontSize: FontSize.xs,
  },
});
