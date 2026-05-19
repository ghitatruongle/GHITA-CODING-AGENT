// ==============================================================================
// GHITA CODING AGENT — App Store (Zustand)
// ==============================================================================

import { create } from 'zustand';
import type { DeviceInfo } from '@ghita/shared';

export type TabId = 'code' | 'api' | 'skills' | 'agents' | 'devices' | 'settings';

export type ThemeMode = 'dark' | 'light';

interface AppState {
  // Tab
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  // Terminal
  isTerminalOpen: boolean;
  terminalHeight: number;
  toggleTerminal: () => void;
  setTerminalHeight: (h: number) => void;

  // Chat
  isChatOpen: boolean;
  toggleChat: () => void;

  // Settings
  theme: ThemeMode;
  language: string;
  logLevel: string;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (lang: string) => void;
  setLogLevel: (level: string) => void;

  // Communication (Phase 6)
  serverStatus: 'offline' | 'listening' | 'error';
  pairingCode: string | null;
  connectedDevices: DeviceInfo[];
  setServerStatus: (status: 'offline' | 'listening' | 'error') => void;
  setPairingCode: (code: string | null) => void;
  setConnectedDevices: (devices: DeviceInfo[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Tab
  activeTab: 'code',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Sidebar
  isSidebarOpen: true,
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

  // Terminal
  isTerminalOpen: true,
  terminalHeight: 250,
  toggleTerminal: () => set((s) => ({ isTerminalOpen: !s.isTerminalOpen })),
  setTerminalHeight: (h) => set({ terminalHeight: Math.max(120, Math.min(600, h)) }),

  // Chat
  isChatOpen: false,
  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),

  // Settings
  theme: (localStorage.getItem('ghita-theme') as ThemeMode) || 'dark',
  language: localStorage.getItem('ghita-language') || 'vi',
  logLevel: localStorage.getItem('ghita-log-level') || 'info',
  setTheme: (theme) => {
    localStorage.setItem('ghita-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  setLanguage: (lang) => {
    localStorage.setItem('ghita-language', lang);
    set({ language: lang });
  },
  setLogLevel: (level) => {
    localStorage.setItem('ghita-log-level', level);
    set({ logLevel: level });
  },

  // Communication (Phase 6)
  serverStatus: 'offline',
  pairingCode: null,
  connectedDevices: [],
  setServerStatus: (status) => set({ serverStatus: status }),
  setPairingCode: (code) => set({ pairingCode: code }),
  setConnectedDevices: (devices) => set({ connectedDevices: devices }),
}));
