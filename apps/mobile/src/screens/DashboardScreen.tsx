import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Card, Text as PaperText, ActivityIndicator } from 'react-native-paper';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { useTranslation } from '../i18n/context';
import type { DashboardScreenProps } from '../navigation/types';
import * as storageService from '../services/storageService';

export function DashboardScreen({ navigation }: DashboardScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [telemetryHistory, setTelemetryHistory] = useState<
    Array<{ day: string; tokens: number; cost: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      const history = await storageService.loadTelemetryHistory();
      setTelemetryHistory(history);
    } catch (err) {
      console.error('[Dashboard] Failed to load telemetry history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  const maxTokens = useMemo(() => {
    if (telemetryHistory.length === 0) return 0;
    return Math.max(...telemetryHistory.map((d) => d.tokens));
  }, [telemetryHistory]);

  const totalCost = useMemo(() => {
    return telemetryHistory.reduce((sum, d) => sum + d.cost, 0);
  }, [telemetryHistory]);

  const totalTokens = useMemo(() => {
    return telemetryHistory.reduce((sum, d) => sum + d.tokens, 0);
  }, [telemetryHistory]);

  const highestDay = useMemo(() => {
    if (telemetryHistory.length === 0) return null;
    return telemetryHistory.reduce(
      (prev, current) => (prev.tokens > current.tokens ? prev : current),
      { day: '', tokens: 0, cost: 0 },
    );
  }, [telemetryHistory]);

  const hasData = useMemo(() => {
    return telemetryHistory.some((d) => d.tokens > 0 || d.cost > 0);
  }, [telemetryHistory]);

  const handleClearHistory = () => {
    Alert.alert(t('dashboard.confirmTitle'), t('dashboard.confirmDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('dashboard.clearBtn'),
        style: 'destructive',
        onPress: async () => {
          await storageService.clearTelemetryHistory();
          await fetchHistory();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" animating={true} />
          <PaperText style={styles.loadingText} variant="bodyLarge">{t('dashboard.loading')}</PaperText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={t('dashboard.title')} titleStyle={{ fontWeight: 'bold' }} />
        {hasData && (
          <Appbar.Action icon="delete" onPress={handleClearHistory} accessibilityLabel={t('dashboard.clearBtn')} />
        )}
      </Appbar.Header>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard} mode="outlined">
            <Card.Content>
              <PaperText variant="labelMedium" style={styles.summaryLabel}>{t('dashboard.totalTokens')}</PaperText>
              <PaperText variant="headlineMedium" style={styles.summaryValue}>{(totalTokens / 1000).toFixed(1)}k</PaperText>
            </Card.Content>
          </Card>
          <Card style={styles.summaryCard} mode="outlined">
            <Card.Content>
              <PaperText variant="labelMedium" style={styles.summaryLabel}>{t('dashboard.estCost')}</PaperText>
              <PaperText variant="headlineMedium" style={styles.summaryValue}>${totalCost.toFixed(4)}</PaperText>
            </Card.Content>
          </Card>
        </View>

        {/* Chart Section */}
        <Card style={styles.section} mode="elevated">
          <Card.Title title={t('dashboard.tokensUsage')} titleStyle={styles.sectionTitle} />
          <Card.Content>
            <View style={styles.chartContainer}>
              {telemetryHistory.map((item, index) => {
                const heightPercent = maxTokens > 0 ? (item.tokens / maxTokens) * 100 : 0;
                const isHighest = highestDay && highestDay.tokens > 0 && highestDay.day === item.day;
                return (
                  <View key={index} style={styles.barColumn}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${heightPercent}%`,
                            backgroundColor: isHighest ? colors.accent : colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, isHighest && styles.barLabelHighest]}>
                      {item.day}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.section} mode="elevated">
          <Card.Title title={t('dashboard.insights')} titleStyle={styles.sectionTitle} />
          <Card.Content>
            <PaperText variant="bodyMedium" style={styles.insightText}>
              {highestDay && highestDay.tokens > 0
                ? t('dashboard.mostUsage', { day: highestDay.day, tokens: (highestDay.tokens / 1000).toFixed(1) })
                : t('dashboard.noUsage')}
              {'\n\n'}
              {t('dashboard.averageDaily', { cost: (totalCost / 7).toFixed(4) })}
            </PaperText>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: Spacing.md,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: FontSize.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backBtnText: {
      color: colors.primaryLight,
      fontSize: FontSize.xl,
      fontWeight: '700',
    },
    headerTitle: {
      color: colors.primaryLight,
      fontSize: FontSize.lg,
      fontWeight: '700',
    },
    headerSpacer: {
      width: 44,
    },
    clearBtn: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    clearBtnText: {
      fontSize: FontSize.xl,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.xl,
      gap: Spacing.lg,
      paddingBottom: Spacing.huge,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.primaryMuted,
      borderRadius: Radius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    summaryLabel: {
      color: colors.textSecondary,
      fontSize: FontSize.sm,
      marginBottom: Spacing.xs,
    },
    summaryValue: {
      color: colors.primary,
      fontSize: FontSize.xxl,
      fontWeight: '700',
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      color: colors.primaryLight,
      fontSize: FontSize.md,
      fontWeight: '600',
      marginBottom: Spacing.xl,
    },
    chartContainer: {
      flexDirection: 'row',
      height: 150,
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingTop: Spacing.md,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
    },
    barTrack: {
      width: 18,
      height: 120,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: Radius.md,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    barFill: {
      width: '100%',
      borderRadius: Radius.md,
    },
    barLabel: {
      color: colors.textSecondary,
      fontSize: FontSize.xs,
      marginTop: Spacing.sm,
    },
    barLabelHighest: {
      color: colors.accent,
      fontWeight: '700',
    },
    insightText: {
      color: colors.textPrimary,
      fontSize: FontSize.md,
      lineHeight: 22,
    },
  });
