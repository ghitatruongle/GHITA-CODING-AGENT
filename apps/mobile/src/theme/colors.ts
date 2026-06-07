// ==============================================================================
// GHITA CODING AGENT — Mobile Theme Colors
// Matches desktop app themes
// ==============================================================================

export const darkColors = {
  // --- Background ---
  background: '#0a0a1a',
  backgroundSecondary: '#1a1a2e',
  backgroundTertiary: '#16213e',
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceElevated: 'rgba(255, 255, 255, 0.08)',

  // --- Primary (Purple/Indigo) ---
  primary: '#818cf8',
  primaryLight: '#a78bfa',
  primaryDark: '#6366f1',
  primaryMuted: 'rgba(99, 102, 241, 0.2)',
  accent: '#c084fc',

  // --- Text ---
  textPrimary: '#e0e0e0',
  textSecondary: '#b0b0d0',
  textMuted: '#a0a0c0',
  textDark: '#606080',

  // --- Status ---
  success: '#28c840',
  successMuted: 'rgba(40, 200, 64, 0.2)',
  warning: '#febc2e',
  warningMuted: 'rgba(254, 188, 46, 0.2)',
  error: '#ff5f57',
  errorMuted: 'rgba(255, 95, 87, 0.2)',
  info: '#818cf8',
  infoMuted: 'rgba(99, 102, 241, 0.2)',

  // --- Borders ---
  border: 'rgba(255, 255, 255, 0.1)',
  borderFocused: 'rgba(168, 85, 247, 0.5)',
  borderPrimary: 'rgba(168, 85, 247, 0.3)',

  // --- Misc ---
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',

  // --- Gradient colors ---
  gradientStart: '#818cf8',
  gradientEnd: '#a78bfa',
};

export const lightColors: typeof darkColors = {
  // --- Background ---
  background: '#f8fafc',
  backgroundSecondary: '#f1f5f9',
  backgroundTertiary: '#e2e8f0',
  surface: '#ffffff',
  surfaceElevated: '#f8fafc',

  // --- Primary (Purple/Indigo) ---
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',
  primaryMuted: 'rgba(99, 102, 241, 0.15)',
  accent: '#a855f7',

  // --- Text ---
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textDark: '#94a3b8',

  // --- Status ---
  success: '#16a34a',
  successMuted: 'rgba(22, 163, 74, 0.15)',
  warning: '#ea580c',
  warningMuted: 'rgba(234, 88, 12, 0.15)',
  error: '#dc2626',
  errorMuted: 'rgba(220, 38, 38, 0.15)',
  info: '#6366f1',
  infoMuted: 'rgba(99, 102, 241, 0.15)',

  // --- Borders ---
  border: '#e2e8f0',
  borderFocused: 'rgba(99, 102, 241, 0.5)',
  borderPrimary: 'rgba(99, 102, 241, 0.3)',

  // --- Misc ---
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.3)',

  // --- Gradient colors ---
  gradientStart: '#6366f1',
  gradientEnd: '#818cf8',
};

// Default export for backward compatibility where needed briefly
export const Colors = darkColors;
export type ColorKey = keyof typeof darkColors;
export type ThemeColors = typeof darkColors;
