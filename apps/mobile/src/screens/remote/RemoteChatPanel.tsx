// Chat message list + input for remote control

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../../theme/styles';
import { ChatInput } from '../../components/ChatInput';
import type { ChatMessage } from '../../types';
import { useTranslation } from '../../i18n/context';

interface RemoteChatPanelProps {
  messages: ChatMessage[];
  isConnected: boolean;
  onSend: (text: string) => void;
}

export function RemoteChatPanel({
  messages,
  isConnected,
  onSend,
}: RemoteChatPanelProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <>
      {/* Chat Messages */}
      {messages.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('remote.chatTitle')}</Text>
          <View style={styles.messageList}>
            {messages.slice(-20).map((item) => (
              <View
                key={item.id}
                style={[
                  styles.messageBubble,
                  item.sender === 'user' ? styles.userBubble : styles.aiBubble,
                ]}
              >
                <Text style={styles.messageText}>{item.text}</Text>
                <Text style={styles.messageTimestamp}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Chat Input */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('remote.chatInputLabel')}</Text>
        <ChatInput
          disabled={!isConnected}
          onSend={onSend}
          placeholder={t('remote.chatInputPlaceholder')}
        />
      </View>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionLabel: {
      color: colors.primaryLight,
      fontSize: FontSize.sm,
      fontWeight: '600',
      marginBottom: Spacing.md,
    },
    messageList: { gap: Spacing.sm },
    messageBubble: {
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      maxWidth: '85%',
    },
    userBubble: { backgroundColor: colors.primaryMuted, alignSelf: 'flex-end' },
    aiBubble: { backgroundColor: colors.surfaceElevated, alignSelf: 'flex-start' },
    messageText: { color: colors.textPrimary, fontSize: FontSize.sm, lineHeight: 20 },
    messageTimestamp: { color: colors.textMuted, fontSize: 10, marginTop: 2, alignSelf: 'flex-end' },
  });
