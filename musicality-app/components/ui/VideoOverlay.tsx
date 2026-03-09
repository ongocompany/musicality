import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing, FontSize, getPhraseColor, blendColors } from '../../constants/theme';
import { CountInfo, getBeatTypeLabel } from '../../utils/beatCounter';

interface VideoOverlayProps {
  countInfo: CountInfo | null;
  hasAnalysis: boolean;
}

/**
 * Semi-transparent count overlay positioned on top of video.
 * Shows the current beat count (1-8) in the bottom-right corner
 * with phrase-aware rainbow coloring and transition hint pulse.
 */
export function VideoOverlay({ countInfo, hasAnalysis }: VideoOverlayProps) {
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

  if (!hasAnalysis || !countInfo) return null;

  // Phrase-aware color
  const hasPhrases = countInfo.totalPhrases > 0;
  let countColor: string;

  if (hasPhrases && isHinting) {
    const currentColor = getPhraseColor(countInfo.phraseIndex);
    const nextColor = getPhraseColor(countInfo.phraseIndex + 1);
    countColor = blendColors(currentColor, nextColor, 0.5);
  } else if (hasPhrases) {
    countColor = getPhraseColor(countInfo.phraseIndex);
  } else {
    const isTapOrPause = countInfo.beatType === 'tap' || countInfo.beatType === 'pause';
    countColor = isTapOrPause ? Colors.tapAccent : Colors.beatPulse;
  }

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Count display */}
      <View style={styles.countContainer}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: Spacing.md,
  },
  countContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    minWidth: 80,
  },
  count: {
    fontSize: 56,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
