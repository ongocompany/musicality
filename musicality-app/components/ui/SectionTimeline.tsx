import { View, Text, StyleSheet } from 'react-native';
import { Section } from '../../types/analysis';
import { SectionColors, Colors, FontSize, Spacing } from '../../constants/theme';

interface SectionTimelineProps {
  sections: Section[];
  duration: number;       // seconds
  currentTimeMs: number;  // milliseconds
}

/**
 * Horizontal bar showing colored rectangles for each music section.
 * Current section gets a bright border; short sections hide labels.
 */
export function SectionTimeline({ sections, duration, currentTimeMs }: SectionTimelineProps) {
  if (!sections || sections.length === 0 || duration <= 0) return null;

  const currentTimeSec = currentTimeMs / 1000;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {sections.map((section, idx) => {
          const startPct = (section.startTime / duration) * 100;
          const widthPct = ((section.endTime - section.startTime) / duration) * 100;
          const isCurrent =
            currentTimeSec >= section.startTime && currentTimeSec < section.endTime;
          const color = SectionColors[section.label] || Colors.textMuted;
          const showLabel = widthPct > 5; // hide label if section < 5% of total

          return (
            <View
              key={`${section.label}-${idx}`}
              style={[
                styles.segment,
                {
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: color,
                  opacity: isCurrent ? 1 : 0.5,
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
                  {section.label.toUpperCase()}
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
