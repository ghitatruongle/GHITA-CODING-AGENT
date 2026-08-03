// ==============================================================================
// GHITA CODING AGENT — App Store (Zustand)
// ==============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DeviceInfo, PluginManifest } from '@ghita/shared';
import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from '../i18n/types';

// Cache file contents outside of React state to prevent massive re-renders
// and out-of-memory errors on large files.
export interface FileCacheEntry {
  content: string;
  originalContent: string;
  /** Encoding detected at read time (utf-8 | utf-8-bom | utf-16le | utf-16be | latin-1). */
  encoding?: string;
  /**
   * Whether the entry has been hydrated from disk. Tabs rehydrated from
   * localStorage after a restart start with empty content and must be loaded
   * from disk (see CodeView) — this flag prevents that reload racing with the
   * user switching tabs.
   */
  hydrated?: boolean;
  /**
   * True when the file exceeded the read cap and `content` is truncated.
   * Saving truncated content would destroy the file's tail — code that persists
   * must refuse to write when this is set.
   */
  isTruncated?: boolean;
}
export const fileContentCache = new Map<string, FileCacheEntry>();

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

export type ViewId = TabId | 'welcome' | 'search';

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

  // v0.7.0 — Command Palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;

  // v0.7.0 — Welcome Splash
  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;

  // v0.7.0 — Active Workspace
  activeWorkspace: string | null;
  setActiveWorkspace: (path: string | null) => void;
  recentWorkspaces: string[];
  addRecentWorkspace: (path: string) => void;

  // v0.7.0 — Editor Preferences
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
  editorWordWrap: boolean;
  setEditorWordWrap: (wrap: boolean) => void;
  editorMinimap: boolean;
  setEditorMinimap: (show: boolean) => void;
  editorLineNumbers: boolean;
  setEditorLineNumbers: (show: boolean) => void;
  editorTabSize: number;
  setEditorTabSize: (size: number) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalFontFamily: string;
  setTerminalFontFamily: (family: string) => void;
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  setTerminalCursorStyle: (style: 'block' | 'underline' | 'bar') => void;

  // v0.7.0 — Keyboard Shortcuts
  shortcutsEnabled: boolean;
  toggleShortcutsEnabled: () => void;

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

  // v0.7.3 — Reset all settings to defaults
  resetSettings: () => void;
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

      // v0.7.0 — Command Palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) =>
        set((s) => ({
          commandPaletteOpen: typeof open === 'function' ? open(s.commandPaletteOpen) : open,
        })),

      // v0.7.0 — Welcome Splash
      showWelcome: true,
      setShowWelcome: (show) => set({ showWelcome: show }),

      // v0.7.0 — Active Workspace
      activeWorkspace: null as string | null,
      setActiveWorkspace: (path) => set({ activeWorkspace: path }),
      recentWorkspaces: [] as string[],
      addRecentWorkspace: (path) =>
        set((s) => ({
          recentWorkspaces: [path, ...s.recentWorkspaces.filter((w) => w !== path)].slice(0, 10),
        })),

      // v0.7.0 — Editor Preferences
      editorFontSize: 14,
      setEditorFontSize: (size) => set({ editorFontSize: Math.max(10, Math.min(32, size)) }),
      editorWordWrap: true,
      setEditorWordWrap: (wrap) => set({ editorWordWrap: wrap }),
      editorMinimap: true,
      setEditorMinimap: (show) => set({ editorMinimap: show }),
      editorLineNumbers: true,
      setEditorLineNumbers: (show) => set({ editorLineNumbers: show }),
      editorTabSize: 2,
      setEditorTabSize: (size) => set({ editorTabSize: Math.max(1, Math.min(8, size)) }),
      terminalFontSize: 13,
      setTerminalFontSize: (size) => set({ terminalFontSize: Math.max(10, Math.min(24, size)) }),
      terminalFontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      setTerminalFontFamily: (family) => set({ terminalFontFamily: family }),
      terminalCursorStyle: 'block',
      setTerminalCursorStyle: (style) => set({ terminalCursorStyle: style }),

      // v0.7.0 — Keyboard Shortcuts
      shortcutsEnabled: true,
      toggleShortcutsEnabled: () => set((s) => ({ shortcutsEnabled: !s.shortcutsEnabled })),

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

      // v0.7.3 — Reset all settings to defaults
      resetSettings: () =>
        set({
          theme: 'dark',
          language: DEFAULT_LOCALE,
          logLevel: 'info',
          editorFontSize: 14,
          editorWordWrap: true,
          editorMinimap: true,
          editorLineNumbers: true,
          editorTabSize: 2,
          terminalFontSize: 13,
          terminalFontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          terminalCursorStyle: 'block',
          shortcutsEnabled: true,
        }),
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
        // v0.7.0 — Persist editor/terminal preferences
        editorFontSize: state.editorFontSize,
        editorWordWrap: state.editorWordWrap,
        editorMinimap: state.editorMinimap,
        editorLineNumbers: state.editorLineNumbers,
        editorTabSize: state.editorTabSize,
        terminalFontSize: state.terminalFontSize,
        terminalFontFamily: state.terminalFontFamily,
        terminalCursorStyle: state.terminalCursorStyle,
        shortcutsEnabled: state.shortcutsEnabled,
        activeWorkspace: state.activeWorkspace,
        recentWorkspaces: state.recentWorkspaces,
        showWelcome: state.showWelcome,
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
