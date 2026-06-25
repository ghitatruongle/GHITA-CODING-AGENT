// ==============================================================================
// GHITA CODING AGENT — Chat Input Component
// Send text commands to AI via Socket.io
// ==============================================================================

import React, { useState, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { useTranslation } from '../i18n/context';

interface ChatInputProps {
  disabled?: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
}

export function ChatInput({
  disabled = false,
  onSend,
  placeholder,
}: ChatInputProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const defaultPlaceholder = placeholder || t('remote.chatInputPlaceholder');

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        value={text}
        onChangeText={setText}
        placeholder={defaultPlaceholder}
        placeholderTextColor={colors.textDark}
        editable={!disabled}
        returnKeyType="send"
        onSubmitEditing={handleSend}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.sendButton, disabled && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={disabled || text.trim().length === 0}
        activeOpacity={0.7}
        accessibilityLabel={t('remote.chatInputLabel')}
        accessibilityRole="button"
      >
        <Text style={styles.sendIcon}>➤</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      borderColor: colors.borderPrimary,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      color: colors.textPrimary,
      fontSize: FontSize.md,
    },
    inputDisabled: {
      opacity: 0.5,
    },
    sendButton: {
      backgroundColor: colors.primary,
      borderRadius: Radius.md,
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
    sendIcon: {
      color: colors.white,
      fontSize: FontSize.lg,
    },
  });
