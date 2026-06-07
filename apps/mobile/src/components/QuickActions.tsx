// ==============================================================================
// GHITA CODING AGENT — Quick Actions Grid
// Screenshot, Cancel, Approve, Reject buttons
// ==============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../theme/styles';
import type { QuickAction } from '../types';
import { useTranslation } from '../i18n/context';

interface QuickActionsProps {
  disabled?: boolean;
  onAction: (type: QuickAction['type']) => void;
}

const ACTIONS: QuickAction[] = [
  { id: 'screenshot', label: 'Screenshot', icon: '📸', type: 'screenshot' },
  { id: 'skills', label: 'Skills', icon: '🧩', type: 'skills' },
  { id: 'cancel', label: 'Cancel', icon: '❌', type: 'cancel' },
  { id: 'approve', label: 'Approve', icon: '✅', type: 'approve' },
  { id: 'reject', label: 'Reject', icon: '🚫', type: 'reject' },
];

export function QuickActions({ disabled = false, onAction }: QuickActionsProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const getActionLabel = (id: string) => {
    switch (id) {
      case 'screenshot':
        return t('remote.actionScreenshot');
      case 'cancel':
        return t('remote.actionCancel');
      case 'approve':
        return t('remote.actionApprove');
      case 'reject':
        return t('remote.actionReject');
      case 'skills':
        return t('remote.actionSkills');
      default:
        return id;
    }
  };

  return (
    <View style={styles.grid}>
      {ACTIONS.map((action) => (
        <TouchableOpacity
          key={action.id}
          style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
          onPress={() => onAction(action.type)}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityLabel={getActionLabel(action.id)}
          accessibilityRole="button"
        >
          <Text style={styles.actionIcon}>{action.icon}</Text>
          <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>
            {getActionLabel(action.id)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    minWidth: '42%',
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 64,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    color: colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  actionLabelDisabled: {
    color: colors.textDark,
  },
});
