// ==============================================================================
// GHITA CODING AGENT — Remote Control Screen
// Main screen after pairing: screen preview, chat, quick actions
// ==============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ScreenPreview } from '../components/ScreenPreview';
import { QuickActions } from '../components/QuickActions';
import { ChatInput } from '../components/ChatInput';
import { socketService } from '../services/socketService';
import type { ConnectionState, QuickAction, ChatMessage } from '../types';
import type { RemoteControlScreenProps } from '../navigation/types';

const MAX_CHAT_MESSAGES = 50;

export function RemoteControlScreen({
  route,
  navigation,
}: RemoteControlScreenProps): React.JSX.Element {
  const { deviceName } = route.params;

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    socketService.isConnected ? 'connected' : 'disconnected',
  );
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const isConnected = connectionState === 'connected';

  // Register socket callbacks
  useEffect(() => {
    socketService.setCallbacks({
      onConnectionChange: (state) => {
        setConnectionState(state);
        if (state === 'error') {
          Alert.alert(
            'Mất kết nối',
            'Không thể kết nối lại với máy tính. Quay lại màn hình ghép đôi?',
            [
              { text: 'Ở lại', style: 'cancel' },
              {
                text: 'Quay lại',
                onPress: () => {
                  socketService.disconnect();
                  navigation.replace('Pairing');
                },
              },
            ],
          );
        }
      },
      onScreenshot: (imageBase64) => {
        setScreenshotBase64(imageBase64);
        setScreenshotLoading(false);
      },
      onChatResponse: (message) => {
        setChatMessages((prev) => {
          const updated = [...prev, message];
          if (updated.length > MAX_CHAT_MESSAGES) {
            return updated.slice(-MAX_CHAT_MESSAGES);
          }
          return updated;
        });
      },
      onError: (error) => {
        Alert.alert(
          'Lỗi kết nối',
          error,
          [
            {
              text: 'OK',
              onPress: () => {
                if (
                  error.includes('Session expired') ||
                  error.includes('re-pair') ||
                  error.includes('Unauthorized')
                ) {
                  socketService.disconnect();
                  navigation.replace('Pairing');
                }
              },
            },
          ]
        );
      },
    });

    return () => {
      socketService.setCallbacks({});
    };
  }, [navigation]);

  // Handle quick action
  const handleQuickAction = useCallback((type: QuickAction['type']) => {
    switch (type) {
      case 'screenshot':
        setScreenshotLoading(true);
        socketService.requestScreenshot();
        break;
      case 'approve':
        socketService.sendApprove();
        break;
      case 'reject':
        socketService.sendReject();
        break;
      case 'cancel':
        socketService.sendCommand('cancel');
        break;
    }
  }, []);

  // Handle chat send
  const handleChatSend = useCallback((text: string) => {
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      text,
      sender: 'user',
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    socketService.sendChatMessage(text);
  }, []);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    Alert.alert(
      'Ngắt kết nối',
      'Bạn có muốn ngắt kết nối với máy tính?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Ngắt kết nối',
          style: 'destructive',
          onPress: () => {
            socketService.disconnect();
            navigation.replace('Pairing');
          },
        },
      ],
    );
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.deviceIcon}>🖥️</Text>
          <View>
            <Text style={styles.deviceName}>{deviceName}</Text>
            <ConnectionStatus state={connectionState} compact />
          </View>
        </View>
        <Text style={styles.disconnectBtn} onPress={handleDisconnect}>
          ✕
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>🖥️ Màn hình Desktop</Text>
          <ScreenPreview
            imageBase64={screenshotBase64}
            loading={screenshotLoading}
            connected={isConnected}
          />
        </View>

        {/* Chat Messages (latest 5) */}
        {chatMessages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>💬 Tin nhắn</Text>
            <View style={styles.messageList}>
              {chatMessages.slice(-5).map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.messageBubble,
                    msg.sender === 'user' ? styles.userBubble : styles.aiBubble,
                  ]}
                >
                  <Text style={styles.messageText}>{msg.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Chat Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>💬 Gửi lệnh cho AI</Text>
          <ChatInput disabled={!isConnected} onSend={handleChatSend} />
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>⚡ Hành động nhanh</Text>
          <QuickActions disabled={!isConnected} onAction={handleQuickAction} />
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  deviceIcon: {
    fontSize: 28,
  },
  deviceName: {
    color: Colors.primaryLight,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  disconnectBtn: {
    color: Colors.textDark,
    fontSize: FontSize.xxl,
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
  },
  contentInner: {
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
  sectionLabel: {
    color: Colors.primaryLight,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  messageList: {
    gap: Spacing.sm,
  },
  messageBubble: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: Colors.primaryMuted,
    alignSelf: 'flex-end',
  },
  aiBubble: {
    backgroundColor: Colors.surfaceElevated,
    alignSelf: 'flex-start',
  },
  messageText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
