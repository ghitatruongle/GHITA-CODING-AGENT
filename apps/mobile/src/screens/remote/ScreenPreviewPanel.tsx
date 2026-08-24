// Screen preview + cost telemetry display

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../../theme/styles';
import { ScreenPreview } from '../../components/ScreenPreview';
import type { CostTelemetry } from './useRemoteControl';
import { useTranslation } from '../../i18n/context';

interface ScreenPreviewPanelProps {
  screenshotBase64: string | null;
  screenshotLoading: boolean;
  isConnected: boolean;
  onScreenTouch: (rx: number, ry: number) => void;
  costTelemetry: CostTelemetry;
}

export function ScreenPreviewPanel({
  screenshotBase64,
  screenshotLoading,
  isConnected,
  onScreenTouch,
  costTelemetry,
}: ScreenPreviewPanelProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <>
      {/* Screen Preview */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('remote.screenTitle')}</Text>
        <ScreenPreview
          imageBase64={screenshotBase64}
          loading={screenshotLoading}
          connected={isConnected}
          onScreenTouch={onScreenTouch}
        />
      </View>

      {/* Cost & Telemetry */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('remote.costTitle')}</Text>
        <View style={styles.costContainer}>
          <View style={styles.costRow}>
            <View>
              <Text style={styles.costLabel}>{t('remote.costSpent')}</Text>
              <Text style={styles.costValue}>${costTelemetry.costUsd.toFixed(4)}</Text>
            </View>
            <View style={styles.costLimitContainer}>
              <Text style={styles.costLabel}>{t('remote.costSessionLimit')}</Text>
              <Text style={styles.costLimit}>${costTelemetry.limitUsd.toFixed(2)}</Text>
            </View>
          </View>

          {/* Budget Progress Bar */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(
                    (costTelemetry.costUsd / Math.max(costTelemetry.limitUsd, 0.01)) * 100,
                    100,
                  )}%`,
                  backgroundColor: `hsl(${Math.max(
                    0,
                    (1 -
                      Math.min(
                        costTelemetry.costUsd / Math.max(costTelemetry.limitUsd, 0.01),
                        1,
                      )) *
                      120,
                  )}, 85%, 45%)`,
                },
              ]}
            />
          </View>

          <View style={styles.tokenRow}>
            <Text style={styles.tokenText}>
              {t('remote.tokensIn')}: {costTelemetry.inputTokens.toLocaleString()}
            </Text>
            <Text style={styles.tokenText}>
              {t('remote.tokensOut')}: {costTelemetry.outputTokens.toLocaleString()}
            </Text>
            <Text style={styles.tokenText}>
              {t('remote.tokensTotal')}: {costTelemetry.totalTokens.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>
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
    costContainer: { gap: Spacing.sm },
    costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    costLabel: { color: colors.textMuted, fontSize: FontSize.xs, textTransform: 'uppercase' },
    costValue: { color: colors.primaryLight, fontSize: FontSize.xl, fontWeight: '800' },
    costLimit: { color: colors.textSecondary, fontSize: FontSize.lg, fontWeight: '700' },
    costLimitContainer: { alignItems: 'flex-end' },
    progressBarBg: {
      height: 8,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderRadius: Radius.sm,
      overflow: 'hidden',
      marginVertical: Spacing.xs,
    },
    progressBarFill: { height: '100%', borderRadius: Radius.sm },
    tokenRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: Spacing.sm,
      marginTop: Spacing.xs,
    },
    tokenText: { color: colors.textSecondary, fontSize: FontSize.xs },
  });
