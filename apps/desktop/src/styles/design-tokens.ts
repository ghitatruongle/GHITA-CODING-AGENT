/**
 * Design Tokens — TypeScript interface matching CSS variables in globals.css.
 * Use these tokens in React components for type-safe access to the design system.
 */

export const designTokens = {
  colors: {
    // Backgrounds
    bg: {
      primary: 'var(--bg-primary)',
      secondary: 'var(--bg-secondary)',
      tertiary: 'var(--bg-tertiary)',
      elevated: 'var(--bg-elevated)',
      surface: 'var(--bg-surface)',
      card: 'var(--bg-card)',
      hover: 'var(--bg-hover)',
      active: 'var(--bg-active)',
    },
    // Accent
    accent: {
      primary: 'var(--accent-primary)',
      secondary: 'var(--accent-secondary)',
      tertiary: 'var(--accent-tertiary)',
      gradient: 'var(--accent-gradient)',
    },
    // Text
    text: {
      primary: 'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      muted: 'var(--text-muted)',
      accent: 'var(--text-accent)',
    },
    // Semantic
    semantic: {
      success: 'var(--success)',
      successBg: 'var(--success-bg)',
      warning: 'var(--warning)',
      warningBg: 'var(--warning-bg)',
      error: 'var(--error)',
      errorBg: 'var(--error-bg)',
      info: 'var(--info)',
      infoBg: 'var(--info-bg)',
    },
    // Borders
    border: {
      subtle: 'var(--border-subtle)',
      default: 'var(--border-default)',
      accent: 'var(--border-accent)',
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '32px',
    '4xl': '48px',
  },
  borderRadius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    full: 'var(--radius-full)',
  },
  shadows: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    glow: 'var(--shadow-glow)',
  },
  typography: {
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
  },
  transitions: {
    fast: 'var(--transition-fast)',
    normal: 'var(--transition-normal)',
    slow: 'var(--transition-slow)',
  },
  sizes: {
    sidebar: 'var(--sidebar-width)',
    tabbar: 'var(--tabbar-height)',
    titlebar: 'var(--titlebar-height)',
    terminalMin: 'var(--terminal-min-height)',
    terminalDefault: 'var(--terminal-default-height)',
  },
  zIndex: {
    dropdown: 1000,
    modal: 1100,
    toast: 1200,
    tooltip: 1300,
  },
} as const;

export type DesignToken = typeof designTokens;
