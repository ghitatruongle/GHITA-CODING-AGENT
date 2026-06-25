// ==============================================================================
// GHITA CODING AGENT — useRemoteControl Hook
// Socket callbacks, state management, and handlers for RemoteControlScreen
// ==============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Vibration, Platform, BackHandler } from 'react-native';
import { socketService } from '../../services/socketService';
import { notificationService } from '../../services/notificationService';
import * as storageService from '../../services/storageService';
import type { ConnectionState, QuickAction, ChatMessage } from '../../types';
import type { RemoteControlScreenProps } from '../../navigation/types';
import { useTranslation } from '../../i18n/context';

const MAX_CHAT_MESSAGES = 50;
const SCREENSHOT_TIMEOUT_MS = 15000;
const generateMessageId = () => `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

export interface CostTelemetry {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  limitUsd: number;
}

export interface UseRemoteControlReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  screenshotBase64: string | null;
  screenshotLoading: boolean;
  chatMessages: ChatMessage[];
  activeApproval: { id: string; command: string } | null;
  costTelemetry: CostTelemetry;
  showSkills: boolean;
  setShowSkills: (v: boolean) => void;
  skillsList: SkillItem[];
  skillsLoading: boolean;
  skillRunning: string | null;
  handleQuickAction: (type: QuickAction['type']) => void;
  handleChatSend: (text: string) => void;
  handleScreenTouch: (rx: number, ry: number) => void;
  handleDisconnect: () => void;
  handleApproveCommand: () => void;
  handleRejectCommand: () => void;
  loadSkills: () => void;
  runSkill: (skillId: string) => void;
}

export function useRemoteControl(
  route: RemoteControlScreenProps['route'],
  navigation: RemoteControlScreenProps['navigation'],
): UseRemoteControlReturn {
  const { t } = useTranslation();

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    socketService.isConnected ? 'connected' : 'disconnected',
  );
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSessionCostRef = useRef(0);
  const lastSessionTokensRef = useRef(0);
  const [activeApproval, setActiveApproval] = useState<{ id: string; command: string } | null>(
    null,
  );
  const [costTelemetry, setCostTelemetry] = useState<CostTelemetry>({
    inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0.0, limitUsd: 5.0,
  });
  const [showSkills, setShowSkills] = useState(false);
  const [skillsList, setSkillsList] = useState<SkillItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillRunning, setSkillRunning] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const isConnected = connectionState === 'connected';

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
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
          chatHistoryRef.current = [];
          setChatMessages([]);
        }
        try {
          const settings = await storageService.loadSettings();
          if (settings.vibrationEnabled && state === 'connected') {
            Vibration.vibrate(Platform.OS === 'ios' ? [0, 15, 60, 15] : [0, 50, 50, 50]);
          }
        } catch {}
        if (state === 'error') {
          Alert.alert(t('remote.lostConnectionTitle'), t('remote.lostConnectionDesc'), [
            { text: t('remote.stay'), style: 'cancel' },
            { text: t('remote.goBack'), onPress: () => { socketService.disconnect(); navigation.replace('Pairing'); } },
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
          if (updated.length > MAX_CHAT_MESSAGES) updated.splice(0, updated.length - MAX_CHAT_MESSAGES);
          chatHistoryRef.current = [...updated];
          return updated;
        });
        if (AppState.currentState !== 'active') {
          notificationService.displayNotification('New Message from Agent', message.text);
        }
        try {
          const settings = await storageService.loadSettings();
          if (settings.vibrationEnabled) {
            Vibration.vibrate(Platform.OS === 'ios' ? 15 : 100);
          }
        } catch {}
      },
      onApprovalRequest: (data) => {
        setActiveApproval(data);
        if (AppState.currentState !== 'active') {
          notificationService.displayNotification('Approval Required', `The agent wants to run: ${data.command}`);
        }
        try {
          Vibration.vibrate(Platform.OS === 'ios' ? [0, 30, 60, 40] : [0, 100, 50, 150]);
        } catch {}
      },
      onCostTelemetry: (data) => {
        setCostTelemetry(data);
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
        Alert.alert(t('common.error'), error, [{
          text: t('common.ok'),
          onPress: () => {
            if (error.includes('Session expired') || error.includes('re-pair') || error.includes('Unauthorized')) {
              socketService.disconnect();
              navigation.replace('Pairing');
            }
          },
        }]);
      },
    });
    return () => { clearScreenshotTimeout(); socketService.clearCallbacks(); };
  }, [clearScreenshotTimeout, navigation, t]);

  // Auto-reconnect
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const settings = await storageService.loadSettings();
        if (settings.autoReconnect && !socketService.isConnected) {
          const last = socketService.getLastUrl();
          if (last) socketService.connect(last);
        }
      } else {
        clearScreenshotTimeout();
        setScreenshotLoading(false);
        setScreenshotBase64(null);
      }
    });
    return () => sub.remove();
  }, [clearScreenshotTimeout]);

  // Android back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backAction = () => {
      if (activeApproval) {
        socketService.sendRejectCommand(activeApproval.id);
        setActiveApproval(null);
        return true;
      }
      Alert.alert(t('remote.disconnectTitle'), t('remote.disconnectDesc'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('remote.disconnectBtn'), onPress: () => { socketService.disconnect(); navigation.replace('Pairing'); } },
      ]);
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => handler.remove();
  }, [navigation, t, activeApproval]);

  const handleQuickAction = useCallback((type: QuickAction['type']) => {
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
      case 'approve': socketService.sendApprove(); break;
      case 'reject': socketService.sendReject(); break;
      case 'cancel': socketService.sendCommand('cancel'); break;
      case 'skills':
        if (!isConnected) return;
        setShowSkills(true);
        loadSkills();
        break;
    }
  }, [clearScreenshotTimeout, isConnected, t]);

  const handleChatSend = useCallback((text: string) => {
    const userMessage: ChatMessage = { id: generateMessageId(), text, sender: 'user', timestamp: Date.now() };
    setChatMessages((prev) => {
      const updated = [...prev, userMessage];
      if (updated.length > MAX_CHAT_MESSAGES) updated.splice(0, updated.length - MAX_CHAT_MESSAGES);
      chatHistoryRef.current = [...updated];
      return updated;
    });
    socketService.sendChatMessage(text);
  }, []);

  const handleScreenTouch = useCallback((rx: number, ry: number) => {
    if (!isConnected) return;
    socketService.sendTouch(rx, ry, 'left', 'click');
  }, [isConnected]);

  const handleDisconnect = useCallback(() => {
    Alert.alert(t('remote.disconnectTitle'), t('remote.disconnectDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('remote.disconnectBtn'), style: 'destructive', onPress: () => { socketService.disconnect(); navigation.replace('Pairing'); } },
    ]);
  }, [navigation, t]);

  const handleApproveCommand = useCallback(() => {
    if (activeApproval) {
      socketService.sendApproveCommand(activeApproval.id);
      setActiveApproval(null);
    }
  }, [activeApproval]);

  const handleRejectCommand = useCallback(() => {
    if (activeApproval) {
      socketService.sendRejectCommand(activeApproval.id);
      setActiveApproval(null);
    }
  }, [activeApproval]);

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
      if (mountedRef.current) Alert.alert('Error', 'Failed to load skills');
    } finally {
      if (mountedRef.current) setSkillsLoading(false);
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
      if (mountedRef.current) Alert.alert('Error', 'Skill execution failed');
    } finally {
      if (mountedRef.current) setSkillRunning(null);
    }
  }, []);

  return {
    connectionState, isConnected, screenshotBase64, screenshotLoading,
    chatMessages, activeApproval, costTelemetry,
    showSkills, setShowSkills, skillsList, skillsLoading, skillRunning,
    handleQuickAction, handleChatSend, handleScreenTouch, handleDisconnect,
    handleApproveCommand, handleRejectCommand, loadSkills, runSkill,
  };
}
