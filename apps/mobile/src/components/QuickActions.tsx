// ==============================================================================
// GHITA CODING AGENT — Quick Actions Grid
// Screenshot, Cancel, Approve, Reject buttons
// ==============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import type { QuickAction } from '../types';

interface QuickActionsProps {
  disabled?: boolean;
  onAction: (type: QuickAction['type']) => void;
}

const ACTIONS: QuickAction[] = [
  { id: 'screenshot', label: 'Screenshot', icon: '📸', type: 'screenshot' },
  { id: 'cancel', label: 'Cancel', icon: '❌', type: 'cancel' },
  { id: 'approve', label: 'Approve', icon: '✅', type: 'approve' },
  { id: 'reject', label: 'Reject', icon: '🚫', type: 'reject' },
];

export function QuickActions({ disabled = false, onAction }: QuickActionsProps): React.JSX.Element {
  return (
    <View style={styles.grid}>
      {ACTIONS.map((action) => (
        <TouchableOpacity
          key={action.id}
          style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
          onPress={() => onAction(action.type)}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityLabel={action.label}
          accessibilityRole="button"
        >
          <Text style={styles.actionIcon}>{action.icon}</Text>
          <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  actionLabelDisabled: {
    color: Colors.textDark,
  },
});
