import { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const BAR_CONTAINER_HEIGHT = 66; // matches SectionTimeline bar height
const BAR_GAP = 0.5;

interface WaveformOverlayProps {
  peaks: number[];       // normalized 0-1 amplitude values
  progress: number;      // 0-1 playback progress
}

/**
 * Renders a simple waveform visualization using thin View bars.
 * Placed as an absolute overlay inside a parent container (66px tall).
 * Played portion is brighter than unplayed portion.
 *
 * Downsamples peaks to fit the available width (one bar per ~2px).
 */
export function WaveformOverlay({ peaks, progress }: WaveformOverlayProps) {
  if (!peaks || peaks.length === 0) return null;

  const screenWidth = Dimensions.get('window').width;

  const bars = useMemo(() => {
    // Target: one bar every ~2.5px for clear visibility
    const maxBars = Math.floor(screenWidth / 2.5);
    const barCount = Math.min(peaks.length, maxBars);

    // Downsample peaks if needed
    const step = peaks.length / barCount;
    const result: { height: number; key: number }[] = [];
    for (let i = 0; i < barCount; i++) {
      const srcIdx = Math.floor(i * step);
      const peak = peaks[srcIdx];
      result.push({
        height: Math.max(2, Math.round(peak * BAR_CONTAINER_HEIGHT)),
        key: i,
      });
    }
    return result;
  }, [peaks, screenWidth]);

  const barWidth = Math.max(1, (screenWidth - bars.length * BAR_GAP) / bars.length);
  const progressIndex = Math.floor(progress * bars.length);

  return (
    <View style={styles.container} pointerEvents="none">
      {bars.map((bar, i) => (
        <View
          key={bar.key}
          style={{
            width: barWidth,
            height: bar.height,
            marginHorizontal: BAR_GAP / 2,
            borderRadius: 1,
            backgroundColor: i <= progressIndex
              ? 'rgba(255,255,255,0.55)'
              : 'rgba(255,255,255,0.2)',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BAR_CONTAINER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 3,
    paddingHorizontal: 1,
  },
});
