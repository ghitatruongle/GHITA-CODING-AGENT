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
import type { ThemeColors } from '../theme/colors';
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
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setDimensions({ width, height });
  };

  useEffect(() => {
    setImageError(false);
    if (imageBase64) {
      Image.getSize(
        `data:image/jpeg;base64,${imageBase64}`,
        (w, h) => {
          if (w > 0 && h > 0) {
            setImageSize({ width: w, height: h });
          }
        },
        () => {
          // Ignore error here, handled by onError
        },
      );
    }
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
    if (
      !onScreenTouch ||
      dimensions.width === 0 ||
      dimensions.height === 0 ||
      imageSize.width === 0 ||
      imageSize.height === 0
    )
      return;
    const { locationX, locationY } = evt.nativeEvent;

    const viewAspect = dimensions.width / dimensions.height;
    const imgAspect = imageSize.width / imageSize.height;

    let actualWidth = dimensions.width;
    let actualHeight = dimensions.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > viewAspect) {
      actualHeight = dimensions.width / imgAspect;
      offsetY = (dimensions.height - actualHeight) / 2;
    } else {
      actualWidth = dimensions.height * imgAspect;
      offsetX = (dimensions.width - actualWidth) / 2;
    }

    if (
      locationX < offsetX ||
      locationX > offsetX + actualWidth ||
      locationY < offsetY ||
      locationY > offsetY + actualHeight
    ) {
      return;
    }

    const rx = (locationX - offsetX) / actualWidth;
    const ry = (locationY - offsetY) / actualHeight;
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

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    // ACCESSIBILITY/CORRECTNESS (audit fix 1.5): the previous style
    // hard-coded `height: 220`, but the touch-coordinate math used
    // the live container height from `onLayout`. When the container was
    // taller than 220px the image occupied only the top 220px and any
    // touch below 220 was either mapped to coordinates outside the
    // image (silently dropped) or scaled against the wrong baseline.
    // The image now stretches to fill the container vertically so
    // its real display height always equals `dimensions.height`.
    image: {
      width: '100%',
      height: '100%',
      aspectRatio: 16 / 9,
    },
  });
