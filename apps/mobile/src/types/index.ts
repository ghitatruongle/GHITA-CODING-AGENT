// Re-export shared types used by mobile app
export type {
  Platform,
  AIProviderType,
  AIMessage,
  MessageType,
  SocketMessage,
  PairingCode,
  DeviceInfo,
} from '@ghita/shared';

// --- Connection State ---
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'pairing' | 'error';

// --- Quick Action ---
export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  type: 'screenshot' | 'cancel' | 'approve' | 'reject' | 'skills';
  disabled?: boolean;
}

// --- Chat Message (mobile-side) ---
export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

// --- Paired Device (persistent) ---
export interface PairedDevice {
  id: string;
  name: string;
  address: string;
  lastConnected: number;
}

// --- App Settings ---
export interface MobileSettings {
  serverAddress: string;
  deviceName: string;
  autoReconnect: boolean;
  vibrationEnabled: boolean;
  language: string;
  theme?: 'light' | 'dark' | 'system';
}

export const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  serverAddress: '',
  deviceName: 'Android Phone',
  autoReconnect: true,
  vibrationEnabled: true,
  language: 'vi',
  theme: 'system',
};
