import { View, StyleSheet, GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useRef, useState, useCallback } from 'react';
import { Colors, SectionColors } from '../../constants/theme';
import { Section } from '../../types/analysis';

interface SeekBarProps {
  value: number;
  max: number;
  onSeek: (value: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  loopStart?: number | null;
  loopEnd?: number | null;
  loopEnabled?: boolean;
  sections?: Section[];
  durationSec?: number;  // duration in seconds for section boundary calculation
}

export function SeekBar({
  value,
  max,
  onSeek,
  onSeekStart,
  onSeekEnd,
  loopStart,
  loopEnd,
  loopEnabled,
  sections,
  durationSec,
}: SeekBarProps) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const containerRef = useRef<View>(null);
  const pageXRef = useRef(0); // container's left edge in page coordinates

  const displayValue = dragging ? dragValue : value;
  const progress = max > 0 ? displayValue / max : 0;
  const loopStartPct = loopStart != null && max > 0 ? loopStart / max : null;
  const loopEndPct = loopEnd != null && max > 0 ? loopEnd / max : null;

  const onLayout = useCallback(() => {
    // measure absolute position on screen
    containerRef.current?.measure((_x, _y, w, _h, pageX) => {
      setWidth(w);
      pageXRef.current = pageX;
    });
  }, []);

  const posFromEvent = useCallback(
    (evt: GestureResponderEvent) => {
      // Use pageX (absolute screen coord) minus container's left edge
      const x = evt.nativeEvent.pageX - pageXRef.current;
      const w = width;
      if (w <= 0) return 0;
      const pct = Math.max(0, Math.min(1, x / w));
      return Math.round(pct * max);
    },
    [max, width],
  );

  const handleTouchStart = useCallback(
    (evt: GestureResponderEvent) => {
      // Re-measure position in case of scroll or layout shift
      containerRef.current?.measure((_x, _y, w, _h, pageX) => {
        pageXRef.current = pageX;
        setWidth(w);
        const x = evt.nativeEvent.pageX - pageX;
        const pct = Math.max(0, Math.min(1, x / w));
        const pos = Math.round(pct * max);
        setDragging(true);
        setDragValue(pos);
        onSeekStart?.();
      });
    },
    [max, onSeekStart],
  );

  const handleTouchMove = useCallback(
    (evt: GestureResponderEvent) => {
      const pos = posFromEvent(evt);
      setDragValue(pos);
    },
    [posFromEvent],
  );

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    onSeek(dragValue);
    onSeekEnd?.();
  }, [dragValue, onSeek, onSeekEnd]);

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleTouchStart}
      onResponderMove={handleTouchMove}
      onResponderRelease={handleTouchEnd}
      onResponderTerminate={handleTouchEnd}
    >
      {/* Invisible hit area — catches all touches so locationX stays consistent */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      <View style={styles.track}>
        {/* Section boundary markers */}
        {sections && durationSec && durationSec > 0 && sections.map((section, idx) => {
          if (idx === 0) return null; // skip first boundary (start of track)
          const boundaryPct = (section.startTime / durationSec) * 100;
          const color = SectionColors[section.label] || Colors.textMuted;
          return (
            <View
              key={`boundary-${idx}`}
              style={[styles.sectionBoundary, { left: `${boundaryPct}%`, backgroundColor: color }]}
              pointerEvents="none"
            />
          );
        })}
        {/* Loop region highlight */}
        {loopEnabled && loopStartPct != null && loopEndPct != null && (
          <View
            style={[
              styles.loopRegion,
              { left: `${loopStartPct * 100}%`, width: `${(loopEndPct - loopStartPct) * 100}%` },
            ]}
            pointerEvents="none"
          />
        )}
        {/* Progress fill */}
        <View style={[styles.fill, { width: `${progress * 100}%` }]} pointerEvents="none" />
      </View>
      {/* Thumb */}
      <View
        style={[styles.thumb, { left: Math.max(0, progress * width - 8) }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 48, justifyContent: 'center', paddingHorizontal: 0 },
  track: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  sectionBoundary: {
    position: 'absolute',
    top: -2,
    width: 1.5,
    height: 8,
    borderRadius: 1,
    zIndex: 2,
  },
  loopRegion: {
    position: 'absolute',
    top: -4,
    height: 12,
    backgroundColor: Colors.loopHighlight,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    top: 16,
  },
});
