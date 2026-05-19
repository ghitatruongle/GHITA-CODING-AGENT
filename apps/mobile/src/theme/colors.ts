// ==============================================================================
// GHITA CODING AGENT — Mobile Theme Colors
// Matches desktop app dark theme from y_tuong.html & plan
// ==============================================================================

export const Colors = {
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

  // --- Gradient colors (for LinearGradient if used) ---
  gradientStart: '#818cf8',
  gradientEnd: '#a78bfa',
} as const;

export type ColorKey = keyof typeof Colors;
