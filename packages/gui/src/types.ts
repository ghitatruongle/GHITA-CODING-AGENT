// ==============================================================================
// GHITA CODING AGENT - Tauri Window Management Types (Phase 33)
// ==============================================================================

/** Logical window role */
export type WindowRole = 'main' | 'chat' | 'settings' | 'agent' | 'logs' | 'tray-popup';

/** Window geometry */
export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Whether window is maximized */
  maximized?: boolean;
  /** Whether window is fullscreen */
  fullscreen?: boolean;
}

/** Window descriptor */
export interface WindowSpec {
  /** Logical role */
  role: WindowRole;
  /** Window label (Tauri id) */
  label: string;
  /** Window title */
  title: string;
  /** URL / route (for multi-window SPA) */
  route: string;
  /** Initial geometry */
  geometry: WindowGeometry;
  /** Whether the window is always on top */
  alwaysOnTop?: boolean;
  /** Whether the window is frameless */
  frameless?: boolean;
  /** Whether decorations are enabled */
  decorations?: boolean;
  /** Minimum size */
  minSize?: { width: number; height: number };
}

/** Persisted window state */
export interface PersistedWindow {
  role: WindowRole;
  label: string;
  geometry: WindowGeometry;
  visible: boolean;
  lastFocusedAt: number;
}

/** Theme kind */
export type ThemeKind = 'light' | 'dark' | 'auto';

/** Theme config */
export interface ThemeConfig {
  kind: ThemeKind;
  /** Accent color (hex) */
  accent: string;
  /** Font family */
  fontFamily: string;
  /** Font size */
  fontSize: number;
}

/** Global shortcut binding */
export interface ShortcutBinding {
  /** Accelerator (e.g. "CmdOrCtrl+Shift+A") */
  accelerator: string;
  /** Action identifier */
  action: string;
  /** Description */
  description?: string;
  /** Whether enabled */
  enabled: boolean;
}

/** Tray menu item */
export interface TrayMenuItem {
  id: string;
  label: string;
  enabled?: boolean;
  checked?: boolean;
  /** Submenu */
  submenu?: TrayMenuItem[];
}
