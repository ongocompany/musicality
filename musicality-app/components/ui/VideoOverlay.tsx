import { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing, getPhraseColor, blendColors } from '../../constants/theme';
import { CountInfo } from '../../utils/beatCounter';

interface VideoOverlayProps {
  countInfo: CountInfo | null;
  hasAnalysis: boolean;
}

/**
 * Semi-transparent count overlay positioned on top of video.
 * Shows the current beat count (1-8) in the bottom-right corner
 * with phrase-aware rainbow coloring. Counts 1 & 5 are emphasized.
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

  // Emphasize counts 1 and 5
  const isEmphasis = countInfo.count === 1 || countInfo.count === 5;
  const emphasisFontSize = isEmphasis ? 72 : 56;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.countContainer}>
        <Animated.Text
          style={[
            styles.count,
            {
              color: countColor,
              fontSize: emphasisFontSize,
              transform: [{ scale: pulseAnim }],
            },
            isEmphasis ? {
              textShadowColor: countColor,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 18,
            } : undefined,
          ]}
        >
          {countInfo.count}
        </Animated.Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  count: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
