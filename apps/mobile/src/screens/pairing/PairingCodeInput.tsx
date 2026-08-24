// Styled text input for the 6-character pairing code

import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../../theme/styles';

const PAIRING_CODE_LENGTH = 6;

interface PairingCodeInputProps {
  value: string;
  onChangeText: (val: string) => void;
  onSubmit: () => void;
  label: string;
  placeholder: string;
}

export function PairingCodeInput({
  value,
  onChangeText,
  onSubmit,
  label,
  placeholder,
}: PairingCodeInputProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, styles.codeInput]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={(val) => onChangeText(val.toUpperCase().slice(0, PAIRING_CODE_LENGTH))}
        maxLength={PAIRING_CODE_LENGTH}
        autoCapitalize="characters"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
  });
