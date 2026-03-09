import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, getPhraseColor } from '../../constants/theme';
import { Phrase } from '../../types/analysis';

interface BoundaryMagnifierProps {
  dragTimeSec: number;
  duration: number;
  phrases: Phrase[];
  waveformPeaks?: number[];
  barWidth: number;
  nearestBeatTime: number;
  beatIndex: number;
}

const MAG_WIDTH = 180;
const MAG_HEIGHT = 66;
const ZOOM = 4; // 4x horizontal zoom
const VISIBLE_RANGE_SEC = 6; // ±3 seconds around drag point

export function BoundaryMagnifier({
  dragTimeSec,
  duration,
  phrases,
  waveformPeaks,
  barWidth,
  nearestBeatTime,
  beatIndex,
}: BoundaryMagnifierProps) {
  // Position magnifier centered on drag point, clamped to bar bounds
  const centerX = (dragTimeSec / duration) * barWidth;
  const left = Math.max(0, Math.min(barWidth - MAG_WIDTH, centerX - MAG_WIDTH / 2));

  // Time range visible in magnifier
  const halfRange = VISIBLE_RANGE_SEC / 2;
  const visibleStart = dragTimeSec - halfRange;
  const visibleEnd = dragTimeSec + halfRange;

  // Phrase segments visible in magnifier
  const visiblePhrases = useMemo(() => {
    return phrases.filter(
      (p) => p.endTime > visibleStart && p.startTime < visibleEnd,
    );
  }, [phrases, visibleStart, visibleEnd]);

  // Waveform bars in the magnified region
  const waveformBars = useMemo(() => {
    if (!waveformPeaks || waveformPeaks.length === 0) return [];
    const peaksPerSec = waveformPeaks.length / duration;
    const startIdx = Math.max(0, Math.floor(visibleStart * peaksPerSec));
    const endIdx = Math.min(waveformPeaks.length, Math.ceil(visibleEnd * peaksPerSec));
    const slice = waveformPeaks.slice(startIdx, endIdx);
    // Downsample to fit magnifier width
    const maxBars = Math.floor(MAG_WIDTH / 2.5);
    if (slice.length <= maxBars) return slice;
    const step = slice.length / maxBars;
    const result: number[] = [];
    for (let i = 0; i < maxBars; i++) {
      result.push(slice[Math.floor(i * step)]);
    }
    return result;
  }, [waveformPeaks, duration, visibleStart, visibleEnd]);

  // Convert time to magnifier X position
  const timeToX = (t: number) =>
    ((t - visibleStart) / (visibleEnd - visibleStart)) * MAG_WIDTH;

  const dragLineX = timeToX(dragTimeSec);
  const snapLineX = timeToX(nearestBeatTime);

  return (
    <View style={[styles.container, { left }]}>
      {/* Phrase color background */}
      {visiblePhrases.map((phrase) => {
        const x = Math.max(0, timeToX(phrase.startTime));
        const xEnd = Math.min(MAG_WIDTH, timeToX(phrase.endTime));
        const w = xEnd - x;
        if (w <= 0) return null;
        return (
          <View
            key={`mag-phrase-${phrase.index}`}
            style={[
              styles.phraseBlock,
              {
                left: x,
                width: w,
                backgroundColor: getPhraseColor(phrase.index),
              },
            ]}
          />
        );
      })}

      {/* Waveform bars */}
      {waveformBars.length > 0 && (
        <View style={styles.waveformRow}>
          {waveformBars.map((peak, i) => {
            const h = Math.max(1, Math.round(peak * (MAG_HEIGHT - 16)));
            return (
              <View
                key={i}
                style={[styles.waveBar, { height: h }]}
              />
            );
          })}
        </View>
      )}

      {/* Snap beat indicator (white line) */}
      {snapLineX >= 0 && snapLineX <= MAG_WIDTH && (
        <View style={[styles.snapLine, { left: snapLineX }]} />
      )}

      {/* Drag position indicator (red line) */}
      {dragLineX >= 0 && dragLineX <= MAG_WIDTH && (
        <View style={[styles.dragLine, { left: dragLineX }]} />
      )}

      {/* Beat label */}
      <View style={styles.labelRow}>
        <Text style={styles.labelText}>
          Beat {beatIndex + 1} · {nearestBeatTime.toFixed(1)}s
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 74,
    width: MAG_WIDTH,
    height: MAG_HEIGHT,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    zIndex: 20,
  },
  phraseBlock: {
    position: 'absolute',
    top: 0,
    height: '100%',
    opacity: 0.5,
  },
  waveformRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    height: MAG_HEIGHT - 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 0.5,
  },
  waveBar: {
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 0.5,
  },
  dragLine: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: '100%',
    backgroundColor: Colors.error,
    zIndex: 3,
  },
  snapLine: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: '100%',
    backgroundColor: Colors.text,
    opacity: 0.7,
    zIndex: 2,
  },
  labelRow: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  labelText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
