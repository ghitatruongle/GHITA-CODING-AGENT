// Quick actions, approval panel, and skills list for remote control

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../../theme/styles';
import { QuickActions } from '../../components/QuickActions';
import type { QuickAction } from '../../types';
import type { SkillItem } from './useRemoteControl';
import { useTranslation } from '../../i18n/context';

interface RemoteActionBarProps {
  isConnected: boolean;
  activeApproval: { id: string; command: string } | null;
  onQuickAction: (type: QuickAction['type']) => void;
  onApprove: () => void;
  onReject: () => void;
  showSkills: boolean;
  setShowSkills: (v: boolean) => void;
  skillsList: SkillItem[];
  skillsLoading: boolean;
  skillRunning: string | null;
  onRunSkill: (skillId: string) => void;
}

export function RemoteActionBar({
  isConnected,
  activeApproval,
  onQuickAction,
  onApprove,
  onReject,
  showSkills,
  setShowSkills,
  skillsList,
  skillsLoading,
  skillRunning,
  onRunSkill,
}: RemoteActionBarProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <>
      {/* Security Command Approval */}
      {activeApproval && (
        <View style={[styles.section, styles.approvalSection]}>
          <Text style={styles.approvalHeader}>{t('remote.securityApprovalTitle')}</Text>
          <Text style={styles.approvalDesc}>{t('remote.securityApprovalDesc')}</Text>
          <View style={styles.commandCodeBlock}>
            <Text style={styles.commandCodeText}>{activeApproval.command}</Text>
          </View>
          <View style={styles.approvalButtonsRow}>
            <TouchableOpacity
              style={[styles.approvalBtn, styles.rejectBtn]}
              onPress={onReject}
            >
              <Text style={styles.approvalBtnText}>{t('remote.securityRejectBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.approvalBtn, styles.approveBtn]}
              onPress={onApprove}
            >
              <Text style={styles.approvalBtnText}>{t('remote.securityApproveBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('remote.quickActionsTitle')}</Text>
        <QuickActions disabled={!isConnected} onAction={onQuickAction} />
      </View>

      {/* Skills Panel */}
      {showSkills && (
        <View style={styles.section}>
          <View style={styles.skillsHeader}>
            <Text style={styles.sectionLabel}>{t('remote.skillsTitle')}</Text>
            <TouchableOpacity onPress={() => setShowSkills(false)} style={styles.skillsCloseBtn}>
              <Text style={styles.skillsCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          {skillsLoading ? (
            <Text style={styles.skillsStatusText}>{t('remote.skillsLoading')}</Text>
          ) : skillsList.length === 0 ? (
            <Text style={styles.skillsStatusText}>{t('remote.noSkills')}</Text>
          ) : (
            skillsList.map((skill) => (
              <TouchableOpacity
                key={skill.id}
                style={[styles.skillItem, skillRunning === skill.id && styles.skillItemRunning]}
                onPress={() => onRunSkill(skill.id)}
                disabled={skillRunning !== null}
              >
                <View style={styles.skillItemHeader}>
                  <Text style={styles.skillName}>{skill.name}</Text>
                  <Text style={styles.skillCategory}>{skill.category}</Text>
                </View>
                {skill.description ? (
                  <Text style={styles.skillDesc} numberOfLines={2}>
                    {skill.description}
                  </Text>
                ) : null}
                {skillRunning === skill.id && (
                  <Text style={styles.skillRunningText}>{t('remote.skillRunning')}</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionLabel: {
      color: colors.primaryLight,
      fontSize: FontSize.sm,
      fontWeight: '600',
      marginBottom: Spacing.md,
    },
    approvalSection: {
      borderColor: colors.warning,
      borderWidth: 2,
      backgroundColor: 'rgba(254, 188, 46, 0.08)',
    },
    approvalHeader: { color: colors.warning, fontSize: FontSize.md, fontWeight: '800', marginBottom: Spacing.xs },
    approvalDesc: { color: colors.textPrimary, fontSize: FontSize.sm, marginBottom: Spacing.md },
    commandCodeBlock: {
      backgroundColor: '#000000',
      padding: Spacing.md,
      borderRadius: Radius.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    commandCodeText: { color: '#818cf8', fontFamily: 'monospace', fontSize: FontSize.sm },
    approvalButtonsRow: { flexDirection: 'row', gap: Spacing.md },
    approvalBtn: { flex: 1, height: 48, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
    approveBtn: { backgroundColor: colors.success },
    rejectBtn: { backgroundColor: colors.error },
    approvalBtnText: { color: '#ffffff', fontSize: FontSize.sm, fontWeight: '700' },
    skillsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    skillsCloseBtn: { padding: Spacing.sm },
    skillsCloseText: { color: colors.textMuted, fontSize: FontSize.lg, fontWeight: '700' },
    skillsStatusText: { color: colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.lg },
    skillItem: {
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginTop: Spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skillItemRunning: { borderColor: colors.primary, opacity: 0.7 },
    skillItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    skillName: { color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
    skillCategory: { color: colors.textMuted, fontSize: FontSize.xs },
    skillDesc: { color: colors.textSecondary, fontSize: FontSize.xs, marginTop: Spacing.xs },
    skillRunningText: { color: colors.primary, fontSize: FontSize.xs, fontWeight: '600', marginTop: Spacing.xs },
  });
