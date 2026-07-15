// ==============================================================================
// GHITA CODING AGENT — App Store (Zustand)
// ==============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DeviceInfo, PluginManifest } from '@ghita/shared';
import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from '../i18n/types';

// Cache file contents outside of React state to prevent massive re-renders
// and out-of-memory errors on large files.
export const fileContentCache = new Map<string, { content: string; originalContent: string }>();

export type TabId =
  | 'code'
  | 'api'
  | 'skills'
  | 'agents'
  | 'devices'
  | 'dashboard'
  | 'monitoring'
  | 'quota'
  | 'code-graph'
  | 'settings'
  | 'marketplace'
  | 'workflow'
  | 'ecosystem';

export type ThemeMode = 'dark' | 'light';

interface AppState {
  // Tab
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // CodeView State
  codeOpenFiles: Array<{
    path: string;
    name: string;
    language: string;
    modified: boolean;
  }>;
  codeActivePath: string;
  setCodeOpenFiles: (files: AppState['codeOpenFiles']) => void;
  setCodeActivePath: (path: string) => void;

  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  // Terminal
  isTerminalOpen: boolean;
  terminalHeight: number;
  terminalCwd: string;
  toggleTerminal: () => void;
  setTerminalHeight: (h: number) => void;
  setTerminalCwd: (cwd: string) => void;

  // Chat
  isChatOpen: boolean;
  toggleChat: () => void;

  // Settings
  theme: ThemeMode;
  language: LocaleCode;
  logLevel: string;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (lang: LocaleCode) => void;
  setLogLevel: (level: string) => void;

  // Communication (Phase 6)
  serverStatus: 'offline' | 'listening' | 'error';
  pairingCode: string | null;
  connectedDevices: DeviceInfo[];
  setServerStatus: (status: 'offline' | 'listening' | 'error') => void;
  setPairingCode: (code: string | null) => void;
  setConnectedDevices: (devices: DeviceInfo[]) => void;

  // Phase 5: MCP Servers
  mcpServers: Array<{
    id: string;
    name: string;
    transport: string;
    enabled: boolean;
    connected: boolean;
  }>;
  setMcpServers: (
    servers: Array<{
      id: string;
      name: string;
      transport: string;
      enabled: boolean;
      connected: boolean;
    }>,
  ) => void;

  // Phase 5: Hooks
  hooks: Array<{ event: string; tool: string; command: string; enabled: boolean }>;
  setHooks: (
    hooks: Array<{ event: string; tool: string; command: string; enabled: boolean }>,
  ) => void;

  // Phase 6: Context usage
  contextUsage: { used: number; max: number; percentage: number };
  setContextUsage: (usage: { used: number; max: number; percentage: number }) => void;

  // Permission Mode
  permissionMode: 'custom' | 'auto';
  setPermissionMode: (mode: 'custom' | 'auto') => void;

  // Phase 7: Dashboard stats
  dashboardStats: {
    totalTokens: number;
    totalCost: number;
    activeAgents: number;
    mcpConnections: number;
  };
  setDashboardStats: (stats: {
    totalTokens: number;
    totalCost: number;
    activeAgents: number;
    mcpConnections: number;
  }) => void;

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

      // CodeView State
      codeOpenFiles: [],
      codeActivePath: '',
      setCodeOpenFiles: (files) => set({ codeOpenFiles: files }),
      setCodeActivePath: (path) => set({ codeActivePath: path }),

      // Sidebar
      isSidebarOpen: true,
      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

      // Terminal
      isTerminalOpen: true,
      terminalHeight: 250,
      terminalCwd: '',
      toggleTerminal: () => set((s) => ({ isTerminalOpen: !s.isTerminalOpen })),
      setTerminalHeight: (h) => set({ terminalHeight: Math.max(120, Math.min(600, h)) }),
      setTerminalCwd: (cwd) => set({ terminalCwd: cwd }),

      // Chat
      isChatOpen: false,
      toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),

      // Settings
      theme: 'dark' as ThemeMode,
      language: DEFAULT_LOCALE,
      logLevel: 'info',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      setLanguage: (lang) => {
        // Runtime guard (review fix): setLanguage's signature is typed
        // `LocaleCode`, but TypeScript types are erased at runtime. Sanitize
        // here so callers like SettingsView (`v as LocaleCode`) or legacy
        // IPC messages cannot poison the persisted locale with a value that
        // isn't in the translations map.
        set({ language: isLocaleCode(lang) ? lang : DEFAULT_LOCALE });
      },
      setLogLevel: (level) => set({ logLevel: level }),

      // Communication (Phase 6)
      serverStatus: 'offline' as 'offline' | 'listening' | 'error',
      pairingCode: null as string | null,
      connectedDevices: [] as DeviceInfo[],
      setServerStatus: (status) => set({ serverStatus: status }),
      setPairingCode: (code) => set({ pairingCode: code }),
      setConnectedDevices: (devices) => set({ connectedDevices: devices }),

      // Phase 5: MCP Servers
      mcpServers: [] as Array<{
        id: string;
        name: string;
        transport: string;
        enabled: boolean;
        connected: boolean;
      }>,
      setMcpServers: (servers) => set({ mcpServers: servers }),

      // Phase 5: Hooks
      hooks: [] as Array<{ event: string; tool: string; command: string; enabled: boolean }>,
      setHooks: (hooks) => set({ hooks: hooks }),

      // Phase 6: Context usage
      contextUsage: { used: 0, max: 128000, percentage: 0 },
      setContextUsage: (usage) => set({ contextUsage: usage }),

      // Permission Mode
      permissionMode: 'custom' as 'custom' | 'auto',
      setPermissionMode: (mode) => set({ permissionMode: mode }),

      // Phase 7: Dashboard stats
      dashboardStats: { totalTokens: 0, totalCost: 0, activeAgents: 0, mcpConnections: 0 },
      setDashboardStats: (stats) => set({ dashboardStats: stats }),

      // Phase 3: Plugins
      plugins: [] as Array<{ manifest: PluginManifest; enabled: boolean }>,
      setPlugins: (plugins) => set({ plugins }),
      togglePlugin: (id, enabled) =>
        set((s) => ({
          plugins: s.plugins.map((p) => (p.manifest.id === id ? { ...p, enabled } : p)),
        })),
      installPlugin: (manifest) =>
        set((s) => {
          if (s.plugins.some((p) => p.manifest.id === manifest.id)) return {};
          return { plugins: [...s.plugins, { manifest, enabled: true }] };
        }),
      uninstallPlugin: (id) =>
        set((s) => ({
          plugins: s.plugins.filter((p) => p.manifest.id !== id),
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
        terminalCwd: state.terminalCwd,
        // Persist only file paths, NOT the full content, to avoid exceeding
        // the 5MB localStorage quota. Content is re-loaded from disk on startup.
        codeOpenFiles: state.codeOpenFiles.map((f) => ({
          path: f.path,
          language: f.language,
        })),
        codeActivePath: state.codeActivePath,
        isTerminalOpen: state.isTerminalOpen,
        plugins: state.plugins,
        permissionMode: state.permissionMode,
      }),
      merge: (persistedState: unknown, currentState: AppState) => {
        // Debug-fix: guard against localStorage corruption where the
        // persisted blob is not a plain object (e.g. a serialized Array,
        // a primitive, or `null`). The `as Record<string, unknown>` cast
        // is a TypeScript-only lie; at runtime we must check before
        // spreading because `{...someNonObject}` can put garbage keys
        // onto `merged` (e.g. array indexes) that later fields then
        // overwrite — silently dropping our defaults.
        const persisted =
          typeof persistedState === 'object' && persistedState !== null
            ? (persistedState as Record<string, unknown>)
            : {};
        const merged = { ...currentState, ...persisted } as AppState;
        // Sanitize the persisted locale — older installs may have `es`/`fr`/`pt`
        // saved before they were removed in v0.0.5. Fall back to DEFAULT_LOCALE
        // if the value is no longer a supported LocaleCode.
        if (!isLocaleCode(merged.language)) {
          merged.language = DEFAULT_LOCALE;
        }
        // Rehydrated codeOpenFiles only has {path, language} — fill in defaults
        // for the remaining required fields so CodeView doesn't get undefined.
        // The `path` runtime check (review fix) catches corrupt localStorage
        // entries where `path` is not a string (e.g., a number from a manual
        // edit); without it, `f.path.split(...)` would throw at startup.
        if (Array.isArray(merged.codeOpenFiles)) {
          const safeEntries: AppState['codeOpenFiles'] = [];
          for (const raw of merged.codeOpenFiles as unknown[]) {
            const f = raw as Partial<AppState['codeOpenFiles'][number]>;
            if (typeof f.path !== 'string') continue;
            if (!fileContentCache.has(f.path)) {
              fileContentCache.set(f.path, { content: '', originalContent: '' });
            }
            safeEntries.push({
              path: f.path,
              name: typeof f.name === 'string' ? f.name : (f.path.split(/[/\\]/).pop() ?? ''),
              language: typeof f.language === 'string' ? f.language : '',
              modified: typeof f.modified === 'boolean' ? f.modified : false,
            });
          }
          merged.codeOpenFiles = safeEntries;
        }
        return merged;
      },
    },
  ),
);
