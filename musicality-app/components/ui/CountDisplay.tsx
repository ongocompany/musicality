import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, FontSize, Fonts, getPhraseColor, blendColors } from '../../constants/theme';
import { CountInfo } from '../../utils/beatCounter';

interface CountDisplayProps {
  countInfo: CountInfo | null;
  hasAnalysis: boolean;
}

export function CountDisplay({ countInfo, hasAnalysis }: CountDisplayProps) {
  const { t } = useTranslation();
  // Pulse animation for transition hint
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isHinting = countInfo?.isTransitionHint ?? false;

  useEffect(() => {
    if (isHinting) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 250, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 250, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isHinting]);

  if (!hasAnalysis) {
    return (
      <View style={styles.container}>
        <Text style={[styles.count, styles.countMuted]}>--</Text>
        <Text style={styles.labelMuted}>{t('player.analyzeToSee')}</Text>
      </View>
    );
  }

  if (!countInfo) {
    return (
      <View style={styles.container}>
        <Text style={[styles.count, styles.countMuted]}>--</Text>
        <Text style={styles.labelMuted}>Waiting for beat...</Text>
      </View>
    );
  }

  // Phrase-aware color
  const hasPhrases = countInfo.totalPhrases > 0;
  let countColor: string;

  if (hasPhrases && isHinting) {
    // Transition hint: blend current → next phrase color
    const currentColor = getPhraseColor(countInfo.phraseIndex);
    const nextColor = getPhraseColor(countInfo.phraseIndex + 1);
    countColor = blendColors(currentColor, nextColor, 0.5);
  } else if (hasPhrases) {
    countColor = getPhraseColor(countInfo.phraseIndex);
  } else {
    // Fallback: legacy colors
    const isTapOrPause = countInfo.beatType === 'tap' || countInfo.beatType === 'pause';
    countColor = isTapOrPause ? Colors.tapAccent : Colors.beatPulse;
  }

  // Emphasize counts 1 and 5
  const isEmphasis = countInfo.count === 1 || countInfo.count === 5;
  const emphasisFontSize = isEmphasis ? FontSize.count * 1.25 : FontSize.count;

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.count,
          {
            color: countColor,
            fontSize: emphasisFontSize,
            transform: [{ scale: pulseAnim }],
            textShadowColor: 'rgba(255,255,255,0.8)',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 3,
          },
          isEmphasis ? {
            textShadowRadius: 24,
          } : undefined,
        ]}
      >
        {countInfo.count}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  count: {
    fontFamily: Fonts.display,
    fontVariant: ['tabular-nums'],
  },
  countMuted: {
    color: Colors.textMuted,
    fontSize: FontSize.count,
  },
  labelMuted: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
});
