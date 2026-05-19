// ==============================================================================
// GHITA CODING AGENT — Mobile Shared Styles
// ==============================================================================

import { StyleSheet } from 'react-native';
import { Colors } from './colors';

// --- Spacing ---
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

// --- Border Radius ---
export const Radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 16,
  round: 9999,
} as const;

// --- Font Sizes ---
export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  title: 28,
} as const;

// --- Common Styles ---
export const CommonStyles = StyleSheet.create({
  // --- Containers ---
  screenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  screenPadding: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },

  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // --- Cards ---
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  cardElevated: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
  },

  // --- Inputs ---
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },

  // --- Buttons ---
  buttonPrimary: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  buttonPrimaryText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700' as const,
  },

  buttonOutline: {
    backgroundColor: Colors.transparent,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  buttonOutlineText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '600' as const,
  },

  // --- Typography ---
  heading: {
    color: Colors.primaryLight,
    fontSize: FontSize.xl,
    fontWeight: '700' as const,
  },

  subheading: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '400' as const,
  },

  label: {
    color: Colors.primaryLight,
    fontSize: FontSize.sm,
    fontWeight: '600' as const,
    marginBottom: Spacing.sm,
  },

  caption: {
    color: Colors.textDark,
    fontSize: FontSize.xs,
  },

  // --- Separators ---
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },

  // --- Row Layout ---
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },

  rowSpaceBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
});
