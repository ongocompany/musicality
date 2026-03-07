import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { CountInfo, getBeatTypeLabel } from '../../utils/beatCounter';

interface CountDisplayProps {
  countInfo: CountInfo | null;
  hasAnalysis: boolean;
}

export function CountDisplay({ countInfo, hasAnalysis }: CountDisplayProps) {
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

  const isTapOrPause = countInfo.beatType === 'tap' || countInfo.beatType === 'pause';
  const countColor = isTapOrPause ? Colors.tapAccent : Colors.beatPulse;

  return (
    <View style={styles.container}>
      <Text style={[styles.count, { color: countColor }]}>
        {countInfo.count}
      </Text>
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
