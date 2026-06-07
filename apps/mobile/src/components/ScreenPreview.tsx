// ==============================================================================
// GHITA CODING AGENT — Screen Preview Component
// Shows desktop screenshot received via Socket.io
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { useTranslation } from '../i18n/context';

interface ScreenPreviewProps {
  imageBase64: string | null;
  loading?: boolean;
  connected?: boolean;
  onScreenTouch?: (x: number, y: number) => void;
}

export const ScreenPreview = React.memo(function ScreenPreview({
  imageBase64,
  loading = false,
  connected = false,
  onScreenTouch,
}: ScreenPreviewProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 320, height: 240 });

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setDimensions({ width, height });
  };

  useEffect(() => {
    setImageError(false);
  }, [imageBase64]);

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.placeholder]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.placeholderText}>{t('remote.screenPreviewLoading')}</Text>
      </View>
    );
  }

  const handleTouch = (evt: GestureResponderEvent) => {
    if (!onScreenTouch || dimensions.width === 0 || dimensions.height === 0) return;
    const { locationX, locationY } = evt.nativeEvent;

    // Tính toán tọa độ tương đối từ 0.0 đến 1.0 dựa vào kích thước thực tế của container
    const rx = locationX / dimensions.width;
    const ry = locationY / dimensions.height;
    onScreenTouch(rx, ry);
  };

  if (imageBase64 && !imageError) {
    return (
      <View style={styles.container} onLayout={handleLayout}>
        <TouchableWithoutFeedback onPress={handleTouch}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Desktop screen preview"
            onError={() => setImageError(true)}
            fadeDuration={0}
          />
        </TouchableWithoutFeedback>
      </View>
    );
  }

  if (imageError) {
    return (
      <View style={[styles.container, styles.placeholder]}>
        <Text style={styles.placeholderIcon}>⚠️</Text>
        <Text style={styles.placeholderText}>{t('remote.screenPreviewError')}</Text>
      </View>
    );
  }

  // Placeholder — no image yet
  return (
    <View style={[styles.container, styles.placeholder]}>
      <Text style={styles.placeholderIcon}>📸</Text>
      <Text style={styles.placeholderText}>
        {connected ? t('remote.screenPreviewPlaceholder') : t('remote.screenPreviewTitle')}
      </Text>
      {!connected && (
        <Text style={styles.placeholderSubtext}>{t('remote.screenPreviewConnecting')}</Text>
      )}
    </View>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 180,
  },
  placeholder: {
    borderStyle: 'dashed',
    borderColor: colors.borderPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.sm,
  },
  placeholderIcon: {
    fontSize: 36,
    marginBottom: Spacing.sm,
  },
  placeholderText: {
    color: colors.textDark,
    fontSize: FontSize.md,
  },
  placeholderSubtext: {
    color: colors.textDark,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  image: {
    width: '100%',
    height: 220,
  },
});
