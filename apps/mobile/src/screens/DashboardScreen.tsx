import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { useTranslation } from '../i18n/context';
import type { DashboardScreenProps } from '../navigation/types';
import * as storageService from '../services/storageService';

const LOCALIZED_TEXTS = {
  vi: {
    title: 'Biểu đồ Phân tích',
    totalTokens: 'Tổng số Token (Tuần)',
    estCost: 'Chi phí Ước tính (Tuần)',
    tokensUsage: 'Lượng Token Sử dụng',
    insights: 'Phân tích & Nhận định',
    loading: 'Đang tải dữ liệu...',
    clearBtn: 'Xóa lịch sử',
    confirmTitle: 'Xác nhận xóa',
    confirmDesc: 'Bạn có chắc chắn muốn xóa lịch sử thống kê sử dụng không?',
    mostUsage: 'Bạn đã sử dụng nhiều token nhất vào {{day}} ({{tokens}}k tokens).',
    noUsage: 'Chưa có lịch sử sử dụng trong tuần này.',
    averageDaily: 'Chi phí trung bình hàng ngày là ${{cost}}.',
  },
  en: {
    title: 'Analytics Dashboard',
    totalTokens: 'Total Tokens (Week)',
    estCost: 'Est. Cost (Week)',
    tokensUsage: 'Tokens Usage',
    insights: 'Insights',
    loading: 'Loading data...',
    clearBtn: 'Clear history',
    confirmTitle: 'Confirm clear',
    confirmDesc: 'Are you sure you want to clear telemetry history?',
    mostUsage: 'You have used the most tokens on {{day}} ({{tokens}}k tokens).',
    noUsage: 'No usage recorded for this week.',
    averageDaily: 'Your average daily cost is ${{cost}}.',
  },
  zh: {
    title: '分析仪表盘',
    totalTokens: '总 Token (本周)',
    estCost: '预估费用 (本周)',
    tokensUsage: 'Token 使用量',
    insights: '使用洞察',
    loading: '加载数据中...',
    clearBtn: '清除历史',
    confirmTitle: '确认清除',
    confirmDesc: '您确定要清除使用历史数据吗？',
    mostUsage: '您在 {{day}} 使用了最多的 Token ({{tokens}}k tokens)。',
    noUsage: '本周暂无使用记录。',
    averageDaily: '您的日均使用费用为 ${{cost}}。',
  },
  ru: {
    title: 'Панель аналитики',
    totalTokens: 'Всего токенов (неделя)',
    estCost: 'Оцен. стоимость (неделя)',
    tokensUsage: 'Использование токенов',
    insights: 'Аналитика',
    loading: 'Загрузка данных...',
    clearBtn: 'Очистить историю',
    confirmTitle: 'Подтверждение',
    confirmDesc: 'Вы уверены, что хотите очистить историю использования?',
    mostUsage: 'Наибольшее количество токенов использовано в {{day}} ({{tokens}}k токенов).',
    noUsage: 'Нет записей использования за эту неделю.',
    averageDaily: 'Средняя стоимость в день: ${{cost}}.',
  }
};

export function DashboardScreen({ navigation }: DashboardScreenProps): React.JSX.Element {
  const { lang } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const texts = LOCALIZED_TEXTS[lang as keyof typeof LOCALIZED_TEXTS] || LOCALIZED_TEXTS.en;

  const [telemetryHistory, setTelemetryHistory] = useState<Array<{ day: string; tokens: number; cost: number }>>([]);
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
    return Math.max(...telemetryHistory.map(d => d.tokens));
  }, [telemetryHistory]);

  const totalCost = useMemo(() => {
    return telemetryHistory.reduce((sum, d) => sum + d.cost, 0);
  }, [telemetryHistory]);

  const totalTokens = useMemo(() => {
    return telemetryHistory.reduce((sum, d) => sum + d.tokens, 0);
  }, [telemetryHistory]);

  const highestDay = useMemo(() => {
    if (telemetryHistory.length === 0) return null;
    return telemetryHistory.reduce((prev, current) => (prev.tokens > current.tokens ? prev : current), { day: '', tokens: 0, cost: 0 });
  }, [telemetryHistory]);

  const hasData = useMemo(() => {
    return telemetryHistory.some(d => d.tokens > 0 || d.cost > 0);
  }, [telemetryHistory]);

  const handleClearHistory = () => {
    Alert.alert(
      texts.confirmTitle,
      texts.confirmDesc,
      [
        { text: LOCALIZED_TEXTS.en.clearBtn, style: 'cancel' }, // Generic placeholder fallback is cancel
        {
          text: texts.clearBtn,
          style: 'destructive',
          onPress: async () => {
            await storageService.clearTelemetryHistory();
            await fetchHistory();
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{texts.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{texts.title}</Text>
        {hasData ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClearHistory}
            accessibilityLabel={texts.clearBtn}
          >
            <Text style={styles.clearBtnText}>🗑️</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{texts.totalTokens}</Text>
            <Text style={styles.summaryValue}>{(totalTokens / 1000).toFixed(1)}k</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{texts.estCost}</Text>
            <Text style={styles.summaryValue}>${totalCost.toFixed(4)}</Text>
          </View>
        </View>

        {/* Chart Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{texts.tokensUsage}</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{texts.insights}</Text>
          <Text style={styles.insightText}>
            {highestDay && highestDay.tokens > 0
              ? texts.mostUsage
                  .replace('{{day}}', highestDay.day)
                  .replace('{{tokens}}', (highestDay.tokens / 1000).toFixed(1))
              : texts.noUsage}
            {'\n\n'}
            {texts.averageDaily.replace('{{cost}}', (totalCost / 7).toFixed(4))}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
