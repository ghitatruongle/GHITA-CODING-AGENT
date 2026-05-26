// ==============================================================================
// GHITA CODING AGENT — Screen Preview Component
// Shows desktop screenshot received via Socket.io
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { View, Image, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing, Radius } from '../theme/styles';
import { useTranslation } from '../i18n/context';

interface ScreenPreviewProps {
  imageBase64: string | null;
  loading?: boolean;
  connected?: boolean;
}

export function ScreenPreview({
  imageBase64,
  loading = false,
  connected = false,
}: ScreenPreviewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [imageBase64]);

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.placeholder]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.placeholderText}>{t('remote.screenPreviewLoading')}</Text>
      </View>
    );
  }

  if (imageBase64 && !imageError) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel="Desktop screen preview"
          onError={() => setImageError(true)}
        />
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
        {connected ? t('remote.screenPreviewPlaceholder') : 'Screen Preview'}
      </Text>
      {!connected && (
        <Text style={styles.placeholderSubtext}>{t('remote.screenPreviewConnecting')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 180,
  },
  placeholder: {
    borderStyle: 'dashed',
    borderColor: Colors.borderPrimary,
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
    color: Colors.textDark,
    fontSize: FontSize.md,
  },
  placeholderSubtext: {
    color: Colors.textDark,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  image: {
    width: '100%',
    height: 220,
  },
});
