import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { CountInfo, getBeatTypeLabel } from '../../utils/beatCounter';

interface VideoOverlayProps {
  countInfo: CountInfo | null;
  hasAnalysis: boolean;
}

/**
 * Semi-transparent count overlay positioned on top of video.
 * Shows the current beat count (1-8) in the bottom-right corner.
 */
export function VideoOverlay({ countInfo, hasAnalysis }: VideoOverlayProps) {
  if (!hasAnalysis || !countInfo) return null;

  const isTapOrPause = countInfo.beatType === 'tap' || countInfo.beatType === 'pause';
  const countColor = isTapOrPause ? Colors.tapAccent : Colors.beatPulse;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Count display */}
      <View style={styles.countContainer}>
        <Text style={[styles.count, { color: countColor }]}>
          {countInfo.count}
        </Text>
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
