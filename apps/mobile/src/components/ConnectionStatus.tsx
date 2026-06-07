import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { FontSize, Spacing } from '../theme/styles';
import type { ConnectionState } from '../types';
import { useTranslation } from '../i18n/context';

interface ConnectionStatusProps {
  state: ConnectionState;
  compact?: boolean;
}

const getStatusConfig = (colors: ThemeColors): Record<ConnectionState, { color: string; label: string }> => ({
  connected: { color: colors.success, label: 'status.connected' },
  connecting: { color: colors.warning, label: 'status.connecting' },
  pairing: { color: colors.info, label: 'status.pairing' },
  disconnected: { color: colors.textDark, label: 'status.disconnected' },
  error: { color: colors.error, label: 'status.error' },
});

export function ConnectionStatus({
  state,
  compact = false,
}: ConnectionStatusProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state === 'connecting' || state === 'pairing') {
      glowAnim.setValue(0);
      const animation = Animated.loop(
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
      );
      animation.start();
      return () => {
        animation.stop();
        glowAnim.setValue(0);
      };
    } else {
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
    return undefined;
  }, [state, glowAnim]);

  const config = getStatusConfig(colors)[state];

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.5],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 0],
  });

  const showGlow = state === 'connecting' || state === 'pairing';

  return (
    <View style={styles.container}>
      <View style={styles.dotContainer}>
        {showGlow && (
          <Animated.View
            style={[
              styles.glowRing,
              {
                borderColor: config.color,
                transform: [{ scale: glowScale }],
                opacity: glowOpacity,
              },
            ]}
          />
        )}
        <View style={[styles.dot, { backgroundColor: config.color }]} />
      </View>
      {!compact && <Text style={[styles.label, { color: config.color }]}>{t(config.label)}</Text>}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dotContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: 'absolute',
  },
  glowRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    position: 'absolute',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
