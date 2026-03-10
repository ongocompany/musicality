import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Phrase } from '../../types/analysis';
import { getPhraseColor, Colors, FontSize, Spacing } from '../../constants/theme';
import { WaveformOverlay } from './WaveformOverlay';

interface SectionTimelineProps {
  phrases: Phrase[];
  duration: number;       // seconds
  currentTimeMs: number;  // milliseconds
  waveformPeaks?: number[];
  onSeekToPhrase?: (timeMs: number) => void;
}

/**
 * Horizontal bar showing colored rectangles for each phrase.
 * Current phrase gets a bright border; short phrases hide labels.
 * Optionally overlays a waveform visualization.
 */
export function SectionTimeline({ phrases, duration, currentTimeMs, waveformPeaks, onSeekToPhrase }: SectionTimelineProps) {
  if (!phrases || phrases.length === 0 || duration <= 0) return null;

  const currentTimeSec = currentTimeMs / 1000;
  const progress = duration > 0 ? currentTimeSec / duration : 0;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {/* Phrase segments */}
        {phrases.map((phrase) => {
          const startPct = (phrase.startTime / duration) * 100;
          const widthPct = ((phrase.endTime - phrase.startTime) / duration) * 100;
          const isCurrent =
            currentTimeSec >= phrase.startTime && currentTimeSec < phrase.endTime;
          const color = getPhraseColor(phrase.index);
          const showLabel = widthPct > 4; // hide label if phrase < 4% of total

          return (
            <TouchableOpacity
              key={`phrase-${phrase.index}`}
              activeOpacity={0.7}
              onPress={() => onSeekToPhrase?.(phrase.startTime * 1000)}
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
            </TouchableOpacity>
          );
        })}
        {/* Waveform layer (on top of phrase segments) */}
        {waveformPeaks && waveformPeaks.length > 0 && (
          <WaveformOverlay peaks={waveformPeaks} progress={progress} />
        )}
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
    height: 66,
    borderRadius: 8,
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
    borderRadius: 6,
    zIndex: 2,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
