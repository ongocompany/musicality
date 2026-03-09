import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing, FontSize, getPhraseColor, blendColors } from '../../constants/theme';
import { CountInfo, getBeatTypeLabel } from '../../utils/beatCounter';

interface CountDisplayProps {
  countInfo: CountInfo | null;
  hasAnalysis: boolean;
}

export function CountDisplay({ countInfo, hasAnalysis }: CountDisplayProps) {
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
        <Text style={styles.labelMuted}>Analyze to see counts</Text>
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

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.count,
          { color: countColor, transform: [{ scale: pulseAnim }] },
        ]}
      >
        {countInfo.count}
      </Animated.Text>
      <Text style={[styles.label, { color: countColor }]}>
        {getBeatTypeLabel(countInfo.beatType)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  count: {
    fontSize: FontSize.count,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  countMuted: {
    color: Colors.textMuted,
  },
  label: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: Spacing.xs,
  },
  labelMuted: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
});
