import { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, GestureResponderEvent } from 'react-native';
import { Phrase } from '../../types/analysis';
import { getPhraseColor, Colors, FontSize, Spacing } from '../../constants/theme';
import { WaveformOverlay } from './WaveformOverlay';

interface SectionTimelineProps {
  phrases: Phrase[];
  duration: number;        // seconds
  currentTimeMs: number;   // milliseconds
  waveformPeaks?: number[];
  onSeek?: (timeMs: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  loopStart?: number | null;  // ms
  loopEnd?: number | null;    // ms
  loopEnabled?: boolean;
}

const BAR_HEIGHT = 50;

/**
 * Combined phrase timeline + seek bar.
 * Shows waveform bars colored by phrase (rainbow) with a vertical playhead line.
 * Touch/drag to seek. Replaces the separate SeekBar component.
 */
export function SectionTimeline({
  phrases,
  duration,
  currentTimeMs,
  waveformPeaks,
  onSeek,
  onSeekStart,
  onSeekEnd,
  loopStart,
  loopEnd,
  loopEnabled,
}: SectionTimelineProps) {
  if (!phrases || phrases.length === 0 || duration <= 0) return null;

  const containerRef = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const pageXRef = useRef(0);

  const currentTimeSec = currentTimeMs / 1000;
  const progress = dragging ? dragProgress : (duration > 0 ? currentTimeSec / duration : 0);

  const onLayout = useCallback(() => {
    containerRef.current?.measure((_x, _y, w, _h, pageX) => {
      setWidth(w);
      pageXRef.current = pageX;
    });
  }, []);

  const progressFromEvent = useCallback(
    (evt: GestureResponderEvent) => {
      const x = evt.nativeEvent.pageX - pageXRef.current;
      return Math.max(0, Math.min(1, x / (width || 1)));
    },
    [width],
  );

  const handleTouchStart = useCallback(
    (evt: GestureResponderEvent) => {
      containerRef.current?.measure((_x, _y, w, _h, pageX) => {
        pageXRef.current = pageX;
        setWidth(w);
        const x = evt.nativeEvent.pageX - pageX;
        const pct = Math.max(0, Math.min(1, x / (w || 1)));
        setDragging(true);
        setDragProgress(pct);
        onSeekStart?.();
      });
    },
    [onSeekStart],
  );

  const handleTouchMove = useCallback(
    (evt: GestureResponderEvent) => {
      setDragProgress(progressFromEvent(evt));
    },
    [progressFromEvent],
  );

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    if (onSeek) {
      onSeek(Math.round(dragProgress * duration * 1000));
    }
    onSeekEnd?.();
  }, [dragProgress, duration, onSeek, onSeekEnd]);

  // Compute loop region percentages
  const durationMs = duration * 1000;
  const loopStartPct = loopEnabled && loopStart != null && durationMs > 0
    ? (loopStart / durationMs) * 100 : null;
  const loopEndPct = loopEnabled && loopEnd != null && durationMs > 0
    ? (loopEnd / durationMs) * 100 : null;

  return (
    <View style={styles.container}>
      {/* Time labels */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>
          {formatTime(dragging ? dragProgress * duration * 1000 : currentTimeMs)}
        </Text>
        <Text style={styles.timeText}>{formatTime(duration * 1000)}</Text>
      </View>

      {/* Timeline bar with seek */}
      <View
        ref={containerRef}
        style={styles.bar}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        {/* Subtle phrase background segments */}
        {phrases.map((phrase) => {
          const startPct = (phrase.startTime / duration) * 100;
          const widthPct = ((phrase.endTime - phrase.startTime) / duration) * 100;
          const color = getPhraseColor(phrase.index);
          return (
            <View
              key={`bg-${phrase.index}`}
              style={[
                styles.segmentBg,
                {
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: color,
                },
              ]}
              pointerEvents="none"
            />
          );
        })}

        {/* Phrase boundary lines */}
        {phrases.map((phrase) => {
          if (phrase.index === 0) return null;
          const pct = (phrase.startTime / duration) * 100;
          return (
            <View
              key={`sep-${phrase.index}`}
              style={[styles.separator, { left: `${pct}%` }]}
              pointerEvents="none"
            />
          );
        })}

        {/* Loop region highlight */}
        {loopStartPct != null && loopEndPct != null && (
          <View
            style={[
              styles.loopRegion,
              { left: `${loopStartPct}%`, width: `${loopEndPct - loopStartPct}%` },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Waveform layer (rainbow-colored by phrase) */}
        {waveformPeaks && waveformPeaks.length > 0 && (
          <WaveformOverlay
            peaks={waveformPeaks}
            progress={progress}
            height={BAR_HEIGHT}
            phrases={phrases}
            duration={duration}
            containerWidth={width}
          />
        )}

        {/* Playhead line */}
        <View
          style={[
            styles.playhead,
            { left: `${progress * 100}%` },
          ]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.xs,
    paddingHorizontal: 0,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timeText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.surface,
  },
  segmentBg: {
    position: 'absolute',
    top: 0,
    height: '100%',
    opacity: 0.12,
    zIndex: 1,
  },
  separator: {
    position: 'absolute',
    top: 0,
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    zIndex: 4,
  },
  loopRegion: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.6)',
    zIndex: 5,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: '100%',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
    // Subtle glow effect
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
});
