import { View, Text, StyleSheet } from 'react-native';
import { Phrase } from '../../types/analysis';
import { getPhraseColor, Colors, FontSize, Spacing } from '../../constants/theme';

interface SectionTimelineProps {
  phrases: Phrase[];
  duration: number;       // seconds
  currentTimeMs: number;  // milliseconds
}

/**
 * Horizontal bar showing colored rectangles for each phrase.
 * Current phrase gets a bright border; short phrases hide labels.
 */
export function SectionTimeline({ phrases, duration, currentTimeMs }: SectionTimelineProps) {
  if (!phrases || phrases.length === 0 || duration <= 0) return null;

  const currentTimeSec = currentTimeMs / 1000;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {phrases.map((phrase) => {
          const startPct = (phrase.startTime / duration) * 100;
          const widthPct = ((phrase.endTime - phrase.startTime) / duration) * 100;
          const isCurrent =
            currentTimeSec >= phrase.startTime && currentTimeSec < phrase.endTime;
          const color = getPhraseColor(phrase.index);
          const showLabel = widthPct > 4; // hide label if phrase < 4% of total

          return (
            <View
              key={`phrase-${phrase.index}`}
              style={[
                styles.segment,
                {
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: color,
                  opacity: isCurrent ? 1 : 0.45,
                  borderWidth: isCurrent ? 1.5 : 0,
                  borderColor: isCurrent ? Colors.text : 'transparent',
                },
              ]}
            >
              {showLabel && (
                <Text
                  style={[styles.label, { color: isCurrent ? Colors.text : Colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {phrase.index + 1}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.xs,
    paddingHorizontal: 0,
  },
  bar: {
    height: 22,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.surface,
  },
  segment: {
    position: 'absolute',
    top: 0,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 3,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
