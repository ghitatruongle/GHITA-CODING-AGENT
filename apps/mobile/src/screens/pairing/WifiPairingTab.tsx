// Wi-Fi pairing: IP address input + pairing code + connect button

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../../theme/styles';
import { PairingCodeInput } from './PairingCodeInput';
import { useTranslation } from '../../i18n/context';

interface WifiPairingTabProps {
  serverAddress: string;
  setServerAddress: (addr: string) => void;
  pairingCode: string;
  setPairingCode: (code: string) => void;
  onConnect: () => void;
  isConnecting: boolean;
  errorMessage: string | null;
}

export function WifiPairingTab({
  serverAddress,
  setServerAddress,
  pairingCode,
  setPairingCode,
  onConnect,
  isConnecting,
  errorMessage,
}: WifiPairingTabProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const wifiInstructions = t('pairing.wifiInstructions');

  return (
    <View style={styles.form}>
      {/* IP Address Input */}
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

      {/* Pairing Code */}
      <PairingCodeInput
        value={pairingCode}
        onChangeText={setPairingCode}
        onSubmit={onConnect}
        label={t('pairing.codeLabel')}
        placeholder={t('pairing.codePlaceholder')}
      />

      {/* Error */}
      {errorMessage && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* Connect Button */}
      <TouchableOpacity
        style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
        onPress={onConnect}
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
        <Text style={styles.instructionTitle}>{t('pairing.wifiInstructionsTitle')}</Text>
        {Array.isArray(wifiInstructions) &&
          wifiInstructions.map((inst: string, index: number) => (
            <Text key={index} style={styles.instructionText}>
              {inst}
            </Text>
          ))}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
  });
