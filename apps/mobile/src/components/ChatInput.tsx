// ==============================================================================
// GHITA CODING AGENT — Chat Input Component
// Send text commands to AI via Socket.io
// ==============================================================================

import React, { useState, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
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
        placeholderTextColor={Colors.textDark}
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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  sendButton: {
    backgroundColor: Colors.primary,
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
    color: Colors.white,
    fontSize: FontSize.lg,
  },
});
