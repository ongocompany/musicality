import { useState, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SectionTimeline } from './SectionTimeline';
import { BoundaryMagnifier } from './BoundaryMagnifier';
import { Phrase } from '../../types/analysis';
import { findNearestBeatIndex } from '../../utils/beatCounter';
import { phrasesFromBoundaries, extractBoundaries } from '../../utils/phraseDetector';
import { Colors } from '../../constants/theme';

interface InteractiveSectionTimelineProps {
  phrases: Phrase[];
  duration: number;
  currentTimeMs: number;
  waveformPeaks?: number[];
  beats: number[];
  onBoundariesChanged: (boundaries: number[], originalBoundaries: number[]) => void;
}

interface DragState {
  boundaryIndex: number;      // index into internal boundaries[]
  currentTimeSec: number;     // live drag position
  originalTimeSec: number;    // boundary value before drag
}

const LONG_PRESS_MS = 350;
const HIT_ZONE_PX = 24;        // touch target width per boundary
const MIN_PHRASE_BEATS = 8;     // minimum 1 eight-count between boundaries

export function InteractiveSectionTimeline({
  phrases,
  duration,
  currentTimeMs,
  waveformPeaks,
  beats,
  onBoundariesChanged,
}: InteractiveSectionTimelineProps) {
  const [barWidth, setBarWidth] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const containerRef = useRef<View>(null);
  const pageXRef = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartInfo = useRef<{ pageX: number; boundaryIdx: number; timeSec: number } | null>(null);

  // Extract boundaries from current phrases
  const boundaries = useMemo(() => extractBoundaries(phrases), [phrases]);

  // Find which boundary is closest to a touch X position (returns index into boundaries[], or -1)
  const findNearestBoundary = useCallback(
    (pageX: number): { index: number; timeSec: number } | null => {
      if (barWidth <= 0 || boundaries.length === 0) return null;
      const x = pageX - pageXRef.current;
      const touchTimeSec = (x / barWidth) * duration;

      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < boundaries.length; i++) {
        const bx = (boundaries[i] / duration) * barWidth;
        const dist = Math.abs(x - bx);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestDist <= HIT_ZONE_PX) {
        return { index: bestIdx, timeSec: boundaries[bestIdx] };
      }
      return null;
    },
    [barWidth, boundaries, duration],
  );

  // Compute clamped time during drag (enforce min 8 beats between neighbors)
  const clampDragTime = useCallback(
    (rawTimeSec: number, boundaryIdx: number): number => {
      // Previous boundary: index-1 in boundaries[] or 0 (track start)
      const prevTimeSec = boundaryIdx > 0 ? boundaries[boundaryIdx - 1] : 0;
      // Next boundary: index+1 in boundaries[] or duration (track end)
      const nextTimeSec = boundaryIdx < boundaries.length - 1 ? boundaries[boundaryIdx + 1] : duration;

      // Convert to beat indices for min-beat enforcement
      const prevBeatIdx = findNearestBeatIndex(prevTimeSec * 1000, beats);
      const nextBeatIdx = boundaryIdx < boundaries.length - 1
        ? findNearestBeatIndex(nextTimeSec * 1000, beats)
        : beats.length;

      const minBeatIdx = prevBeatIdx + MIN_PHRASE_BEATS;
      const maxBeatIdx = nextBeatIdx - MIN_PHRASE_BEATS;

      if (minBeatIdx >= maxBeatIdx) return rawTimeSec; // can't move, phrases too small

      const minTime = minBeatIdx < beats.length ? beats[minBeatIdx] : prevTimeSec;
      const maxTime = maxBeatIdx < beats.length ? beats[maxBeatIdx] : nextTimeSec;

      return Math.max(minTime, Math.min(maxTime, rawTimeSec));
    },
    [boundaries, duration, beats],
  );

  // Preview phrases during drag
  const previewPhrases = useMemo(() => {
    if (!dragState) return phrases;
    const newBoundaries = [...boundaries];
    newBoundaries[dragState.boundaryIndex] = dragState.currentTimeSec;
    const result = phrasesFromBoundaries(beats, newBoundaries, duration);
    return result.phrases;
  }, [dragState, boundaries, beats, duration, phrases]);

  // Snap to nearest beat and commit
  const commitDrag = useCallback(
    (ds: DragState) => {
      const beatIdx = findNearestBeatIndex(ds.currentTimeSec * 1000, beats);
      const snappedTime = beatIdx >= 0 && beatIdx < beats.length ? beats[beatIdx] : ds.currentTimeSec;

      const newBoundaries = [...boundaries];
      newBoundaries[ds.boundaryIndex] = snappedTime;
      onBoundariesChanged(newBoundaries, boundaries);
    },
    [boundaries, beats, onBoundariesChanged],
  );

  // Nearest beat info for magnifier
  const nearestBeatInfo = useMemo(() => {
    if (!dragState) return { time: 0, index: 0 };
    const idx = findNearestBeatIndex(dragState.currentTimeSec * 1000, beats);
    return {
      time: idx >= 0 && idx < beats.length ? beats[idx] : dragState.currentTimeSec,
      index: idx >= 0 ? idx : 0,
    };
  }, [dragState, beats]);

  // ─── Gesture handlers ─────────────────────────────

  const onLayout = useCallback(() => {
    containerRef.current?.measure((_x, _y, w, _h, pageX) => {
      setBarWidth(w);
      pageXRef.current = pageX;
    });
  }, []);

  const handleGrant = useCallback(
    (evt: GestureResponderEvent) => {
      // Re-measure in case of scroll
      containerRef.current?.measure((_x, _y, w, _h, pageX) => {
        pageXRef.current = pageX;
        setBarWidth(w);

        const hit = findNearestBoundary(evt.nativeEvent.pageX);
        if (!hit) {
          touchStartInfo.current = null;
          return;
        }

        touchStartInfo.current = {
          pageX: evt.nativeEvent.pageX,
          boundaryIdx: hit.index,
          timeSec: hit.timeSec,
        };

        // Start long-press timer
        longPressTimer.current = setTimeout(() => {
          if (!touchStartInfo.current) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setDragState({
            boundaryIndex: touchStartInfo.current.boundaryIdx,
            currentTimeSec: touchStartInfo.current.timeSec,
            originalTimeSec: touchStartInfo.current.timeSec,
          });
        }, LONG_PRESS_MS);
      });
    },
    [findNearestBoundary],
  );

  const handleMove = useCallback(
    (evt: GestureResponderEvent) => {
      if (!dragState) {
        // If moved too much before long-press fires, cancel
        if (touchStartInfo.current && longPressTimer.current) {
          const dx = Math.abs(evt.nativeEvent.pageX - touchStartInfo.current.pageX);
          if (dx > 10) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
            touchStartInfo.current = null;
          }
        }
        return;
      }

      const x = evt.nativeEvent.pageX - pageXRef.current;
      const rawTime = Math.max(0, Math.min(duration, (x / barWidth) * duration));
      const clamped = clampDragTime(rawTime, dragState.boundaryIndex);
      setDragState((prev) => prev ? { ...prev, currentTimeSec: clamped } : null);
    },
    [dragState, barWidth, duration, clampDragTime],
  );

  const handleRelease = useCallback(() => {
    // Cancel long-press timer if still pending
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartInfo.current = null;

    if (dragState) {
      commitDrag(dragState);
      setDragState(null);
    }
  }, [dragState, commitDrag]);

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={onLayout}
      onStartShouldSetResponder={() => boundaries.length > 0}
      onMoveShouldSetResponder={() => dragState !== null}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}
    >
      {/* Underlying SectionTimeline */}
      <SectionTimeline
        phrases={dragState ? previewPhrases : phrases}
        duration={duration}
        currentTimeMs={currentTimeMs}
        waveformPeaks={waveformPeaks}
      />

      {/* Boundary handles */}
      {barWidth > 0 &&
        boundaries.map((time, i) => {
          const x = (time / duration) * barWidth;
          const isActive = dragState?.boundaryIndex === i;
          const activeX = isActive
            ? (dragState!.currentTimeSec / duration) * barWidth
            : x;

          return (
            <View
              key={`handle-${i}`}
              style={[styles.handleHitArea, { left: activeX - HIT_ZONE_PX / 2 }]}
              pointerEvents="none"
            >
              <View
                style={[
                  styles.handleLine,
                  isActive && styles.handleLineActive,
                ]}
              />
              {isActive && <View style={styles.handleDiamond} />}
            </View>
          );
        })}

      {/* Magnifier (during drag only) */}
      {dragState && barWidth > 0 && (
        <BoundaryMagnifier
          dragTimeSec={dragState.currentTimeSec}
          duration={duration}
          phrases={dragState ? previewPhrases : phrases}
          waveformPeaks={waveformPeaks}
          barWidth={barWidth}
          nearestBeatTime={nearestBeatInfo.time}
          beatIndex={nearestBeatInfo.index}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  handleHitArea: {
    position: 'absolute',
    top: 4, // offset for container marginTop in SectionTimeline
    width: HIT_ZONE_PX,
    height: 66,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  handleLine: {
    width: 2,
    height: 74,
    backgroundColor: Colors.textMuted,
    opacity: 0.35,
    borderRadius: 1,
  },
  handleLineActive: {
    width: 3,
    backgroundColor: Colors.primary,
    opacity: 1,
  },
  handleDiamond: {
    position: 'absolute',
    width: 10,
    height: 10,
    backgroundColor: Colors.primary,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
    top: 28, // vertically centered in 66px
  },
});
