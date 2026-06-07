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
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ScreenPreview } from '../components/ScreenPreview';
import { QuickActions } from '../components/QuickActions';
import { ChatInput } from '../components/ChatInput';
import { socketService } from '../services/socketService';
import { notificationService } from '../services/notificationService';
import * as storageService from '../services/storageService';
import type { ConnectionState, QuickAction, ChatMessage } from '../types';
import type { RemoteControlScreenProps } from '../navigation/types';
import { useTranslation } from '../i18n/context';

const MAX_CHAT_MESSAGES = 50;
const SCREENSHOT_TIMEOUT_MS = 15000;
// Intentionally module-level to persist across re-renders for unique message ID generation
const generateMessageId = () => {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

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
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { deviceName } = route.params;

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    socketService.isConnected ? 'connected' : 'disconnected',
  );
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSessionCostRef = useRef(0);
  const lastSessionTokensRef = useRef(0);

  // Phase 8 States
  const [activeApproval, setActiveApproval] = useState<{ id: string; command: string } | null>(
    null,
  );
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

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const result = await socketService.listSkills();
      if (!mountedRef.current) return;
      if (result.success && result.skills) {
        setSkillsList(result.skills.filter((s) => s.enabled));
      } else {
        Alert.alert('Error', result.error || 'Failed to load skills');
      }
    } catch {
      if (mountedRef.current) {
        Alert.alert('Error', 'Failed to load skills');
      }
    } finally {
      if (mountedRef.current) {
        setSkillsLoading(false);
      }
    }
  }, []);

  const runSkill = useCallback(async (skillId: string) => {
    setSkillRunning(skillId);
    try {
      const result = await socketService.runSkill(skillId);
      if (!mountedRef.current) return;
      if (result.success) {
        Alert.alert('Success', `Skill "${skillId}" completed`);
      } else {
        Alert.alert('Error', result.error || 'Skill execution failed');
      }
    } catch {
      if (mountedRef.current) {
        Alert.alert('Error', 'Skill execution failed');
      }
    } finally {
      if (mountedRef.current) {
        setSkillRunning(null);
      }
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
        if (state === 'disconnected') {
          lastSessionCostRef.current = 0;
          lastSessionTokensRef.current = 0;
        }
        // Vibrate on successful connection
        try {
          const settings = await storageService.loadSettings();
          if (settings.vibrationEnabled && state === 'connected') {
            if (Platform.OS === 'ios') {
              Vibration.vibrate([0, 15, 60, 15]); // Delicate double haptic tick on iOS
            } else {
              Vibration.vibrate([0, 50, 50, 50]); // Standard double tap on Android
            }
          }
        } catch {}
        if (state === 'error') {
          Alert.alert(t('remote.lostConnectionTitle'), t('remote.lostConnectionDesc'), [
            { text: t('remote.stay'), style: 'cancel' },
            {
              text: t('remote.goBack'),
              onPress: () => {
                socketService.disconnect();
                navigation.replace('Pairing');
              },
            },
          ]);
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
        
        if (AppState.currentState !== 'active') {
          notificationService.displayNotification('New Message from Agent', message.text);
        }

        // Vibrate on AI response
        try {
          const settings = await storageService.loadSettings();
          if (settings.vibrationEnabled) {
            if (Platform.OS === 'ios') {
              Vibration.vibrate(15); // Light single haptic click on iOS
            } else {
              Vibration.vibrate(100); // Short vibration on Android
            }
          }
        } catch {}
      },
      onApprovalRequest: (data) => {
        setActiveApproval(data);
        if (AppState.currentState !== 'active') {
          notificationService.displayNotification('Approval Required', `The agent wants to run: ${data.command}`);
        }
        // Vibrate to alert the user of security action
        try {
          if (Platform.OS === 'ios') {
            Vibration.vibrate([0, 30, 60, 40]); // Double alert haptic pulse on iOS
          } else {
            Vibration.vibrate([0, 100, 50, 150]); // High alert vibration on Android
          }
        } catch {}
      },
      onCostTelemetry: (data) => {
        setCostTelemetry(data);
        
        // Calculate difference to save dynamically per day
        const diffCost = Math.max(0, data.costUsd - lastSessionCostRef.current);
        const diffTokens = Math.max(0, data.totalTokens - lastSessionTokensRef.current);
        
        lastSessionCostRef.current = data.costUsd;
        lastSessionTokensRef.current = data.totalTokens;
        
        if (diffTokens > 0 || diffCost > 0) {
          storageService.saveTelemetry(diffTokens, diffCost).catch(console.error);
        }
      },
      onError: (error) => {
        clearScreenshotTimeout();
        setScreenshotLoading(false);
        Alert.alert(t('common.error'), error, [
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
        ]);
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
      } else {
        // App goes to background: clear pending screen capture timeout, loading state & base64 image memory
        clearScreenshotTimeout();
        setScreenshotLoading(false);
        setScreenshotBase64(null);
      }
    });
    return () => subscription.remove();
  }, [clearScreenshotTimeout]);

  // Handle Android back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const backAction = () => {
      if (activeApproval) {
        // Reject approval first if active
        socketService.sendRejectCommand(activeApproval.id);
        setActiveApproval(null);
        return true;
      }

      Alert.alert(t('remote.disconnectTitle'), t('remote.disconnectDesc'), [
        {
          text: t('common.cancel'),
          onPress: () => null,
          style: 'cancel',
        },
        {
          text: t('remote.disconnectBtn'),
          onPress: () => {
            socketService.disconnect();
            navigation.replace('Pairing');
          },
        },
      ]);
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [navigation, t, activeApproval]);

  // Handle quick action
  const handleQuickAction = useCallback(
    (type: QuickAction['type']) => {
      switch (type) {
        case 'screenshot':
          if (!isConnected) return;
          clearScreenshotTimeout();
          setScreenshotLoading(true);
          screenshotTimeoutRef.current = setTimeout(() => {
            screenshotTimeoutRef.current = null;
            setScreenshotLoading(false);
            Alert.alert(t('remote.chatTimeoutTitle'), t('remote.screenshotTimeoutDesc'));
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
    },
    [clearScreenshotTimeout, isConnected, t, loadSkills],
  );

  // Handle chat send
  const handleChatSend = useCallback((text: string) => {
    const userMessage: ChatMessage = {
      id: generateMessageId(),
      text,
      sender: 'user',
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    socketService.sendChatMessage(text);
  }, []);

  // Handle screen touch (for remote control interaction)
  const handleScreenTouch = useCallback(
    (rx: number, ry: number) => {
      if (!isConnected) return;
      socketService.sendTouch(rx, ry, 'left', 'click');
    },
    [isConnected],
  );

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    Alert.alert(t('remote.disconnectTitle'), t('remote.disconnectDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('remote.disconnectBtn'),
        style: 'destructive',
        onPress: () => {
          socketService.disconnect();
          navigation.replace('Pairing');
        },
      },
    ]);
  }, [navigation, t]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                    {socketService.connectionType === 'local'
                      ? t('status.lanConnection')
                      : t('status.cloudConnection')}
                  </Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Dashboard')}
              style={styles.settingsBtnTouchable}
              accessibilityLabel="Dashboard"
            >
              <Text style={styles.settingsBtnText}>📊</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              style={styles.settingsBtnTouchable}
              accessibilityLabel="Settings"
            >
              <Text style={styles.settingsBtnText}>&#9881;</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDisconnect}
              style={styles.disconnectBtnTouchable}
              accessibilityLabel="Disconnect"
            >
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
              onScreenTouch={handleScreenTouch}
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
                        100,
                      )}%`,
                      backgroundColor: `hsl(${Math.max(
                        0,
                        (1 - Math.min(costTelemetry.costUsd / Math.max(costTelemetry.limitUsd, 0.01), 1)) * 120,
                      )}, 85%, 45%)`,
                    },
                  ]}
                />
              </View>

              <View style={styles.tokenRow}>
                <Text style={styles.tokenText}>
                  {t('remote.tokensIn')}: {costTelemetry.inputTokens.toLocaleString()}
                </Text>
                <Text style={styles.tokenText}>
                  {t('remote.tokensOut')}: {costTelemetry.outputTokens.toLocaleString()}
                </Text>
                <Text style={styles.tokenText}>
                  {t('remote.tokensTotal')}: {costTelemetry.totalTokens.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          {/* Chat Messages (latest 20) */}
          {chatMessages.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('remote.chatTitle')}</Text>
              <View style={styles.messageList}>
                {chatMessages.slice(-20).map((item) => (
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
              onSend={handleChatSend}
              placeholder={t('remote.chatInputPlaceholder')}
            />
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
                <Text style={styles.sectionLabel}>{t('remote.skillsTitle')}</Text>
                <TouchableOpacity
                  onPress={() => setShowSkills(false)}
                  style={styles.skillsCloseBtn}
                >
                  <Text style={styles.skillsCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              {skillsLoading ? (
                <Text style={styles.skillsStatusText}>{t('remote.skillsLoading')}</Text>
              ) : skillsList.length === 0 ? (
                <Text style={styles.skillsStatusText}>{t('remote.noSkills')}</Text>
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
                      <Text style={styles.skillDesc} numberOfLines={2}>
                        {skill.description}
                      </Text>
                    ) : null}
                    {skillRunning === skill.id && (
                      <Text style={styles.skillRunningText}>{t('remote.skillRunning')}</Text>
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.primaryLight,
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
    color: colors.textSecondary,
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
    color: colors.textDark,
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
    backgroundColor: colors.primaryMuted,
    alignSelf: 'flex-end',
  },
  aiBubble: {
    backgroundColor: colors.surfaceElevated,
    alignSelf: 'flex-start',
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  messageTimestamp: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  // Phase 8 Styles
  approvalSection: {
    borderColor: colors.warning,
    borderWidth: 2,
    backgroundColor: 'rgba(254, 188, 46, 0.08)',
  },
  approvalHeader: {
    color: colors.warning,
    fontSize: FontSize.md,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  approvalDesc: {
    color: colors.textPrimary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  commandCodeBlock: {
    backgroundColor: '#000000',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.success,
  },
  rejectBtn: {
    backgroundColor: colors.error,
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
    color: colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
  },
  costValue: {
    color: colors.primaryLight,
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  costLimit: {
    color: colors.textSecondary,
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
    borderTopColor: colors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  tokenText: {
    color: colors.textSecondary,
    fontSize: FontSize.xs,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectionTypeText: {
    fontSize: 10,
    color: colors.textMuted,
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
    color: colors.textMuted,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  skillsStatusText: {
    color: colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  skillItem: {
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillItemRunning: {
    borderColor: colors.primary,
    opacity: 0.7,
  },
  skillItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillName: {
    color: colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  skillCategory: {
    color: colors.textMuted,
    fontSize: FontSize.xs,
  },
  skillDesc: {
    color: colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  skillRunningText: {
    color: colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
});
