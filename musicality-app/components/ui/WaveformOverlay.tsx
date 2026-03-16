import { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Phrase } from '../../types/analysis';
import { getPhraseColor } from '../../constants/theme';

const BAR_GAP = 0.5;

interface WaveformOverlayProps {
  peaks: number[];       // normalized 0-1 amplitude values
  progress: number;      // 0-1 playback progress
  height?: number;       // container height (default 50)
  phrases?: Phrase[];    // phrase data for rainbow coloring
  duration?: number;     // total duration in seconds
  containerWidth?: number; // actual container width (from parent)
}

/**
 * Renders waveform bars colored by phrase (rainbow).
 * Played portion is brighter; unplayed is dimmer.
 */
export function WaveformOverlay({ peaks, progress, height = 50, phrases, duration, containerWidth }: WaveformOverlayProps) {
  if (!peaks || peaks.length === 0) return null;

  const effectiveWidth = containerWidth || Dimensions.get('window').width;

  const bars = useMemo(() => {
    const maxBars = Math.floor(effectiveWidth / 2.5);
    const barCount = Math.min(peaks.length, maxBars);
    const step = peaks.length / barCount;

    const result: { height: number; key: number; color: string }[] = [];
    for (let i = 0; i < barCount; i++) {
      const srcIdx = Math.floor(i * step);
      const peak = peaks[srcIdx];

      // Determine phrase color for this bar position
      let color = 'rgba(255,255,255,0.5)'; // fallback
      if (phrases && phrases.length > 0 && duration && duration > 0) {
        const timeSec = (i / barCount) * duration;
        for (let p = phrases.length - 1; p >= 0; p--) {
          if (timeSec >= phrases[p].startTime) {
            color = getPhraseColor(phrases[p].index);
            break;
          }
        }
      }

      result.push({
        height: Math.max(2, Math.round(peak * height)),
        key: i,
        color,
      });
    }
    return result;
  }, [peaks, effectiveWidth, phrases, duration, height]);

  const barWidth = Math.max(1, (effectiveWidth - bars.length * BAR_GAP) / bars.length);
  const progressIndex = Math.floor(progress * bars.length);

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      {bars.map((bar, i) => {
        const isPast = i <= progressIndex;
        return (
          <View
            key={bar.key}
            style={{
              width: barWidth,
              height: bar.height,
              marginHorizontal: BAR_GAP / 2,
              borderRadius: 1,
              backgroundColor: bar.color,
              opacity: isPast ? 0.9 : 0.3,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 3,
    paddingHorizontal: 1,
  },
});
