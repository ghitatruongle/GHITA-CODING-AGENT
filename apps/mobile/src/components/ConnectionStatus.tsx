// ==============================================================================
// GHITA CODING AGENT — Connection Status Indicator
// ==============================================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing } from '../theme/styles';
import type { ConnectionState } from '../types';

interface ConnectionStatusProps {
  state: ConnectionState;
  compact?: boolean;
}

const STATUS_CONFIG: Record<ConnectionState, { color: string; label: string }> = {
  connected: { color: Colors.success, label: 'Đã kết nối' },
  connecting: { color: Colors.warning, label: 'Đang kết nối...' },
  pairing: { color: Colors.info, label: 'Đang ghép đôi...' },
  disconnected: { color: Colors.textDark, label: 'Chưa kết nối' },
  error: { color: Colors.error, label: 'Lỗi kết nối' },
};

export function ConnectionStatus({ state, compact = false }: ConnectionStatusProps): React.JSX.Element {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'connecting' || state === 'pairing') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
    return undefined;
  }, [state, pulseAnim]);

  const config = STATUS_CONFIG[state];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: config.color, opacity: pulseAnim },
        ]}
      />
      {!compact && (
        <Text style={[styles.label, { color: config.color }]}>
          {config.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
