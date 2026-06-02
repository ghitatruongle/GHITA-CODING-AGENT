// ==============================================================================
// GHITA CODING AGENT — Remote Control Screen
// Main screen after pairing: screen preview, chat, quick actions
// ==============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  StatusBar,
  Alert,
  TouchableOpacity,
  AppState,
  Vibration,
  KeyboardAvoidingView,
  Platform,
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
import { useTranslation } from '../i18n/context';

const MAX_CHAT_MESSAGES = 50;
const SCREENSHOT_TIMEOUT_MS = 15000;
// Intentionally module-level to persist across re-renders for unique message ID generation
let msgCounter = 0;

interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

export function RemoteControlScreen({
  route,
  navigation,
}: RemoteControlScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const { deviceName } = route.params;

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    socketService.isConnected ? 'connected' : 'disconnected',
  );
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Skills panel state
  const [showSkills, setShowSkills] = useState(false);
  const [skillsList, setSkillsList] = useState<SkillItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillRunning, setSkillRunning] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const result = await socketService.listSkills();
      if (result.success && result.skills) {
        setSkillsList(result.skills.filter((s) => s.enabled));
      } else {
        Alert.alert('Error', result.error || 'Failed to load skills');
      }
    } catch {
      Alert.alert('Error', 'Failed to load skills');
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const runSkill = useCallback(async (skillId: string) => {
    setSkillRunning(skillId);
    try {
      const result = await socketService.runSkill(skillId);
      if (result.success) {
        Alert.alert('Success', `Skill "${skillId}" completed`);
      } else {
        Alert.alert('Error', result.error || 'Skill execution failed');
      }
    } catch {
      Alert.alert('Error', 'Skill execution failed');
    } finally {
      setSkillRunning(null);
    }
  }, []);

  const clearScreenshotTimeout = useCallback(() => {
    if (screenshotTimeoutRef.current) {
      clearTimeout(screenshotTimeoutRef.current);
      screenshotTimeoutRef.current = null;
    }
  }, []);

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
            t('remote.lostConnectionTitle'),
            t('remote.lostConnectionDesc'),
            [
              { text: t('remote.stay'), style: 'cancel' },
              {
                text: t('remote.goBack'),
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
        clearScreenshotTimeout();
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
        clearScreenshotTimeout();
        setScreenshotLoading(false);
        Alert.alert(
          t('common.error'),
          error,
          [
            {
              text: t('common.ok'),
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
      clearScreenshotTimeout();
      socketService.clearCallbacks();
    };
  }, [clearScreenshotTimeout, navigation, t]);

  // Auto-reconnect when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const settings = await storageService.loadSettings();
        if (settings.autoReconnect && !socketService.isConnected) {
          const lastAddress = socketService.getLastUrl();
          if (lastAddress) {
            console.info('[AutoReconnect] Attempting reconnection to', lastAddress);
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
        if (!isConnected) return;
        clearScreenshotTimeout();
        setScreenshotLoading(true);
        screenshotTimeoutRef.current = setTimeout(() => {
          screenshotTimeoutRef.current = null;
          setScreenshotLoading(false);
          Alert.alert(t('remote.chatTimeoutTitle'), t('remote.chatTimeoutDesc'));
        }, SCREENSHOT_TIMEOUT_MS);
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
      case 'skills':
        if (!isConnected) return;
        setShowSkills(true);
        loadSkills();
        break;
    }
  }, [clearScreenshotTimeout, isConnected, t, loadSkills]);

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
      t('remote.disconnectTitle'),
      t('remote.disconnectDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('remote.disconnectBtn'),
          style: 'destructive',
          onPress: () => {
            socketService.disconnect();
            navigation.replace('Pairing');
          },
        },
      ],
    );
  }, [navigation, t]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.deviceIcon}>🖥️</Text>
          <View>
            <Text style={styles.deviceName}>{deviceName}</Text>
            <View style={styles.connectionRow}>
              <ConnectionStatus state={connectionState} compact />
              {connectionState === 'connected' && (
                <Text style={styles.connectionTypeText}>
                  {socketService.connectionType === 'local' ? t('status.lanConnection') : t('status.cloudConnection')}
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
        keyboardShouldPersistTaps="handled"
      >
        {/* Security Command Approval Request (Phase 8 Human-in-the-loop) */}
        {activeApproval && (
          <View style={[styles.section, styles.approvalSection]}>
            <Text style={styles.approvalHeader}>{t('remote.securityApprovalTitle')}</Text>
            <Text style={styles.approvalDesc}>{t('remote.securityApprovalDesc')}</Text>
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
                <Text style={styles.approvalBtnText}>{t('remote.securityRejectBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approvalBtn, styles.approveBtn]}
                onPress={() => {
                  socketService.sendApproveCommand(activeApproval.id);
                  setActiveApproval(null);
                }}
              >
                <Text style={styles.approvalBtnText}>{t('remote.securityApproveBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Screen Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('remote.screenTitle')}</Text>
          <ScreenPreview
            imageBase64={screenshotBase64}
            loading={screenshotLoading}
            connected={isConnected}
          />
        </View>

        {/* Cost & Telemetry Resources (Phase 8 Cost Telemetry) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('remote.costTitle')}</Text>
          <View style={styles.costContainer}>
            <View style={styles.costRow}>
              <View>
                <Text style={styles.costLabel}>{t('remote.costSpent')}</Text>
                <Text style={styles.costValue}>${costTelemetry.costUsd.toFixed(4)}</Text>
              </View>
              <View style={styles.costLimitContainer}>
                <Text style={styles.costLabel}>{t('remote.costSessionLimit')}</Text>
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
              <Text style={styles.tokenText}>{t('remote.tokensIn')}: {costTelemetry.inputTokens.toLocaleString()}</Text>
              <Text style={styles.tokenText}>{t('remote.tokensOut')}: {costTelemetry.outputTokens.toLocaleString()}</Text>
              <Text style={styles.tokenText}>{t('remote.tokensTotal')}: {costTelemetry.totalTokens.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Chat Messages (latest 20) */}
        {chatMessages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('remote.chatTitle')}</Text>
            <FlatList
              data={chatMessages.slice(-20)}
              keyExtractor={(item) => item.id}
              style={styles.messageListScroll}
              nestedScrollEnabled
              renderItem={({ item }) => (
                <View
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
              )}
            />
          </View>
        )}

        {/* Chat Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('remote.chatInputLabel')}</Text>
          <ChatInput disabled={!isConnected} onSend={handleChatSend} placeholder={t('remote.chatInputPlaceholder')} />
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('remote.quickActionsTitle')}</Text>
          <QuickActions disabled={!isConnected} onAction={handleQuickAction} />
        </View>

        {/* Skills Panel */}
        {showSkills && (
          <View style={styles.section}>
            <View style={styles.skillsHeader}>
              <Text style={styles.sectionLabel}>Skills</Text>
              <TouchableOpacity onPress={() => setShowSkills(false)} style={styles.skillsCloseBtn}>
                <Text style={styles.skillsCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {skillsLoading ? (
              <Text style={styles.skillsStatusText}>Loading skills...</Text>
            ) : skillsList.length === 0 ? (
              <Text style={styles.skillsStatusText}>No skills available</Text>
            ) : (
              skillsList.map((skill) => (
                <TouchableOpacity
                  key={skill.id}
                  style={[styles.skillItem, skillRunning === skill.id && styles.skillItemRunning]}
                  onPress={() => runSkill(skill.id)}
                  disabled={skillRunning !== null}
                >
                  <View style={styles.skillItemHeader}>
                    <Text style={styles.skillName}>{skill.name}</Text>
                    <Text style={styles.skillCategory}>{skill.category}</Text>
                  </View>
                  {skill.description ? (
                    <Text style={styles.skillDesc} numberOfLines={2}>{skill.description}</Text>
                  ) : null}
                  {skillRunning === skill.id && (
                    <Text style={styles.skillRunningText}>Running...</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
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
  messageTimestamp: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    alignSelf: 'flex-end',
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
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectionTypeText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  costLimitContainer: {
    alignItems: 'flex-end',
  },
  skillsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillsCloseBtn: {
    padding: Spacing.sm,
  },
  skillsCloseText: {
    color: Colors.textMuted,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  skillsStatusText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  skillItem: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skillItemRunning: {
    borderColor: Colors.primary,
    opacity: 0.7,
  },
  skillItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillName: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  skillCategory: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  skillDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  skillRunningText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
});
