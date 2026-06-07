// ==============================================================================
// GHITA CODING AGENT — Error Fallback Component
// Used with react-error-boundary pattern from plan
// ==============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../theme/styles';

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  // Do NOT use useTranslation() here — if I18nProvider caused the error,
  // calling useTranslation() would throw again, creating an infinite loop.
  // Use hardcoded English fallback text instead.

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message} numberOfLines={5}>
        {error.message}
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={resetError} activeOpacity={0.7}>
        <Text style={styles.retryText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
  },
  icon: {
    fontSize: 48,
    marginBottom: Spacing.xl,
  },
  title: {
    color: colors.error,
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  message: {
    color: colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
  },
  retryText: {
    color: colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
