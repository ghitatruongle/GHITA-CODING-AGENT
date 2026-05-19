// ==============================================================================
// GHITA CODING AGENT — Error Fallback Component
// Used with react-error-boundary pattern from plan
// ==============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>Đã xảy ra lỗi</Text>
      <Text style={styles.message} numberOfLines={5}>
        {error.message}
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={resetError} activeOpacity={0.7}>
        <Text style={styles.retryText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
  },
  icon: {
    fontSize: 48,
    marginBottom: Spacing.xl,
  },
  title: {
    color: Colors.error,
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
  },
  retryText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
