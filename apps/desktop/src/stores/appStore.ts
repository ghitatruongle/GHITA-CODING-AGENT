// ==============================================================================
// GHITA CODING AGENT — App Store (Zustand)
// ==============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DeviceInfo, PluginManifest } from '@ghita/shared';

export type TabId = 'code' | 'api' | 'skills' | 'agents' | 'devices' | 'dashboard' | 'settings' | 'marketplace' | 'workflow' | 'ecosystem';

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

  // Phase 5: MCP Servers
  mcpServers: Array<{ name: string; transport: string; enabled: boolean; connected: boolean }>;
  setMcpServers: (servers: Array<{ name: string; transport: string; enabled: boolean; connected: boolean }>) => void;

  // Phase 5: Hooks
  hooks: Array<{ event: string; tool: string; command: string; enabled: boolean }>;
  setHooks: (hooks: Array<{ event: string; tool: string; command: string; enabled: boolean }>) => void;

  // Phase 6: Context usage
  contextUsage: { used: number; max: number; percentage: number };
  setContextUsage: (usage: { used: number; max: number; percentage: number }) => void;

  // Phase 7: Dashboard stats
  dashboardStats: { totalTokens: number; totalCost: number; activeAgents: number; mcpConnections: number };
  setDashboardStats: (stats: { totalTokens: number; totalCost: number; activeAgents: number; mcpConnections: number }) => void;

  // Phase 3: Plugins
  plugins: Array<{ manifest: PluginManifest; enabled: boolean }>;
  setPlugins: (plugins: Array<{ manifest: PluginManifest; enabled: boolean }>) => void;
  togglePlugin: (id: string, enabled: boolean) => void;
  installPlugin: (manifest: PluginManifest) => void;
  uninstallPlugin: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Tab
      activeTab: 'code' as TabId,
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
      theme: 'dark' as ThemeMode,
      language: 'vi',
      logLevel: 'info',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      setLanguage: (lang) => set({ language: lang }),
      setLogLevel: (level) => set({ logLevel: level }),

      // Communication (Phase 6)
      serverStatus: 'offline' as 'offline' | 'listening' | 'error',
      pairingCode: null as string | null,
      connectedDevices: [] as DeviceInfo[],
      setServerStatus: (status) => set({ serverStatus: status }),
      setPairingCode: (code) => set({ pairingCode: code }),
      setConnectedDevices: (devices) => set({ connectedDevices: devices }),

      // Phase 5: MCP Servers
      mcpServers: [] as Array<{ name: string; transport: string; enabled: boolean; connected: boolean }>,
      setMcpServers: (servers) => set({ mcpServers: servers }),

      // Phase 5: Hooks
      hooks: [] as Array<{ event: string; tool: string; command: string; enabled: boolean }>,
      setHooks: (hooks) => set({ hooks: hooks }),

      // Phase 6: Context usage
      contextUsage: { used: 0, max: 128000, percentage: 0 },
      setContextUsage: (usage) => set({ contextUsage: usage }),

      // Phase 7: Dashboard stats
      dashboardStats: { totalTokens: 0, totalCost: 0, activeAgents: 0, mcpConnections: 0 },
      setDashboardStats: (stats) => set({ dashboardStats: stats }),

      // Phase 3: Plugins
      plugins: [] as Array<{ manifest: PluginManifest; enabled: boolean }>,
      setPlugins: (plugins) => set({ plugins }),
      togglePlugin: (id, enabled) => set((s) => ({
        plugins: s.plugins.map((p) => p.manifest.id === id ? { ...p, enabled } : p)
      })),
      installPlugin: (manifest) => set((s) => {
        if (s.plugins.some((p) => p.manifest.id === manifest.id)) return {};
        return { plugins: [...s.plugins, { manifest, enabled: true }] };
      }),
      uninstallPlugin: (id) => set((s) => ({
        plugins: s.plugins.filter((p) => p.manifest.id !== id)
      })),
    }),
    {
      name: 'ghita-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        logLevel: state.logLevel,
        activeTab: state.activeTab,
        isTerminalOpen: state.isTerminalOpen,
        plugins: state.plugins,
      }),
    },
  ),
);
