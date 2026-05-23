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
  TouchableOpacity,
  AppState,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ScreenPreview } from '../components/ScreenPreview';
import { QuickActions } from '../components/QuickActions';
import { ChatInput } from '../components/ChatInput';
import { socketService } from '../services/socketService';
import * as storageService from '../services/storageService';
import type { ConnectionState, QuickAction, ChatMessage } from '../types';
import type { RemoteControlScreenProps } from '../navigation/types';

const MAX_CHAT_MESSAGES = 50;
let msgCounter = 0;

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

  // Phase 8 States
  const [activeApproval, setActiveApproval] = useState<{ id: string; command: string } | null>(null);
  const [costTelemetry, setCostTelemetry] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    limitUsd: number;
  }>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0.0,
    limitUsd: 5.0,
  });

  const isConnected = connectionState === 'connected';

  // Register socket callbacks
  useEffect(() => {
    socketService.setCallbacks({
      onConnectionChange: async (state) => {
        setConnectionState(state);
        // Vibrate on successful connection
        try {
          const settings = await storageService.loadSettings();
          if (settings.vibrationEnabled && state === 'connected') {
            Vibration.vibrate([0, 50, 50, 50]); // Double tap
          }
        } catch {}
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
      onChatResponse: async (message) => {
        setChatMessages((prev) => {
          const updated = [...prev, message];
          if (updated.length > MAX_CHAT_MESSAGES) {
            return updated.slice(-MAX_CHAT_MESSAGES);
          }
          return updated;
        });
        // Vibrate on AI response
        try {
          const settings = await storageService.loadSettings();
          if (settings.vibrationEnabled) {
            Vibration.vibrate(100); // Short vibration
          }
        } catch {}
      },
      onApprovalRequest: (data) => {
        setActiveApproval(data);
        // Vibrate to alert the user of security action
        try {
          Vibration.vibrate([0, 100, 50, 150]);
        } catch {}
      },
      onCostTelemetry: (data) => {
        setCostTelemetry(data);
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
      socketService.clearCallbacks();
    };
  }, [navigation]);

  // Auto-reconnect when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        // App came to foreground
        const settings = await storageService.loadSettings();
        if (settings.autoReconnect && !socketService.isConnected) {
          // Try to reconnect
          const lastAddress = socketService.getLastUrl();
          if (lastAddress) {
            console.log('[AutoReconnect] Attempting reconnection to', lastAddress);
            socketService.connect(lastAddress);
          }
        }
      }
    });
    return () => subscription.remove();
  }, []);

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
      id: `user_${Date.now()}_${++msgCounter}`,
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ConnectionStatus state={connectionState} compact />
              {connectionState === 'connected' && (
                <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                  {socketService.connectionType === 'local' ? ' • 🟢 LAN (Tốc độ cao)' : ' • 🌐 Cloud (Khác mạng)'}
                </Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsBtnTouchable}
            accessibilityLabel="Settings"
          >
            <Text style={styles.settingsBtnText}>&#9881;</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtnTouchable} accessibilityLabel="Disconnect">
            <Text style={styles.disconnectBtnText}>&#10005;</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* Security Command Approval Request (Phase 8 Human-in-the-loop) */}
        {activeApproval && (
          <View style={[styles.section, styles.approvalSection]}>
            <Text style={styles.approvalHeader}>🛡️ DUYỆT LỆNH BẢO MẬT</Text>
            <Text style={styles.approvalDesc}>AI đang yêu cầu thực thi lệnh terminal sau:</Text>
            <View style={styles.commandCodeBlock}>
              <Text style={styles.commandCodeText}>{activeApproval.command}</Text>
            </View>
            <View style={styles.approvalButtonsRow}>
              <TouchableOpacity
                style={[styles.approvalBtn, styles.rejectBtn]}
                onPress={() => {
                  socketService.sendRejectCommand(activeApproval.id);
                  setActiveApproval(null);
                }}
              >
                <Text style={styles.approvalBtnText}>Từ chối (Reject)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approvalBtn, styles.approveBtn]}
                onPress={() => {
                  socketService.sendApproveCommand(activeApproval.id);
                  setActiveApproval(null);
                }}
              >
                <Text style={styles.approvalBtnText}>Cho phép (Approve)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Screen Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>🖥️ Màn hình Desktop</Text>
          <ScreenPreview
            imageBase64={screenshotBase64}
            loading={screenshotLoading}
            connected={isConnected}
          />
        </View>

        {/* Cost & Telemetry Resources (Phase 8 Cost Telemetry) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>📊 Chi phí & Tài nguyên AI</Text>
          <View style={styles.costContainer}>
            <View style={styles.costRow}>
              <View>
                <Text style={styles.costLabel}>Đã chi tiêu (USD)</Text>
                <Text style={styles.costValue}>${costTelemetry.costUsd.toFixed(4)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.costLabel}>Hạn mức Session</Text>
                <Text style={styles.costLimit}>${costTelemetry.limitUsd.toFixed(2)}</Text>
              </View>
            </View>

            {/* Budget Progress Bar */}
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(
                      (costTelemetry.costUsd / Math.max(costTelemetry.limitUsd, 0.01)) * 100,
                      100
                    )}%`,
                    backgroundColor:
                      costTelemetry.costUsd >= costTelemetry.limitUsd * 0.9
                        ? Colors.error
                        : Colors.success,
                  },
                ]}
              />
            </View>

            <View style={styles.tokenRow}>
              <Text style={styles.tokenText}>📥 In: {costTelemetry.inputTokens.toLocaleString()}</Text>
              <Text style={styles.tokenText}>📤 Out: {costTelemetry.outputTokens.toLocaleString()}</Text>
              <Text style={styles.tokenText}>∑ Total: {costTelemetry.totalTokens.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Chat Messages (latest 20) */}
        {chatMessages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>💬 Tin nhắn</Text>
            <ScrollView style={styles.messageListScroll} nestedScrollEnabled>
              <View style={styles.messageList}>
              {chatMessages.slice(-20).map((msg) => (
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
            </ScrollView>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingsBtnTouchable: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  settingsBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xxl,
  },
  disconnectBtnTouchable: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  disconnectBtnText: {
    color: Colors.textDark,
    fontSize: FontSize.xxl,
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
  messageListScroll: {
    maxHeight: 300,
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
  // Phase 8 Styles
  approvalSection: {
    borderColor: Colors.warning,
    borderWidth: 2,
    backgroundColor: 'rgba(254, 188, 46, 0.08)',
  },
  approvalHeader: {
    color: Colors.warning,
    fontSize: FontSize.md,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  approvalDesc: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  commandCodeBlock: {
    backgroundColor: '#000000',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  commandCodeText: {
    color: '#818cf8',
    fontFamily: 'monospace',
    fontSize: FontSize.sm,
  },
  approvalButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  approvalBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  rejectBtn: {
    backgroundColor: Colors.error,
  },
  approvalBtnText: {
    color: '#ffffff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  costContainer: {
    gap: Spacing.sm,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
  },
  costValue: {
    color: Colors.primaryLight,
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  costLimit: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: Radius.sm,
    overflow: 'hidden',
    marginVertical: Spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.sm,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  tokenText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
});
