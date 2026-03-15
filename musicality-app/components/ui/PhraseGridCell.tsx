import React, { useEffect, useRef, useCallback } from 'react';
import { TouchableOpacity, Animated, StyleSheet, View, Text, Platform } from 'react-native';
import { Colors } from '../../constants/theme';

export type CellState = 'upcoming' | 'current' | 'played' | 'hidden';

interface PhraseGridCellProps {
  cellIndex: number;
  state: CellState;
  color: string;
  size: number;
  isFlashing: boolean;
  onPress: (cellIndex: number) => void;
  onLongPress: (cellIndex: number) => void;
  repeatMarker?: 'A' | 'B' | null;
  rowLabel?: string | null;    // eight-count row number (1,2,3,4) on first cell of each row
  hasNote?: boolean;           // show teal dot for cell memo
  hasFormation?: boolean;      // show formation indicator (top-left dot)
  beatCount?: number;          // 1-8 count shown inside the cell
  phraseLabel?: string | null; // phrase number shown in first column cell
}

function PhraseGridCellInner({ cellIndex, state, color, size, isFlashing, onPress, onLongPress, repeatMarker, rowLabel, hasNote, hasFormation, beatCount, phraseLabel }: PhraseGridCellProps) {
  const handlePress = useCallback(() => onPress(cellIndex), [onPress, cellIndex]);
  const handleLongPress = useCallback(() => onLongPress(cellIndex), [onLongPress, cellIndex]);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const prevStateRef = useRef<CellState>(state);

  // Punch + glow animation when becoming 'current'
  useEffect(() => {
    if (state === 'current' && prevStateRef.current !== 'current') {
      // Scale punch: 1.35 → 1.05 spring bounce
      scaleAnim.setValue(1.35);
      Animated.spring(scaleAnim, {
        toValue: 1.05,
        friction: 4,
        tension: 280,
        useNativeDriver: true,
      }).start();

      // Glow pulse: 1 → 0.2
      glowAnim.setValue(1);
      Animated.timing(glowAnim, {
        toValue: 0.2,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } else if (state !== 'current' && prevStateRef.current === 'current') {
      scaleAnim.setValue(1);
      glowAnim.setValue(0);
    }
    prevStateRef.current = state;
  }, [state]);

  if (state === 'hidden') {
    return <View style={{ width: size, height: size, margin: GAP / 2 }} />;
  }

  const isPlayed = state === 'played';
  const backgroundColor = isFlashing
    ? '#FFFFFF'
    : isPlayed
      ? Colors.surfaceLight
      : color;

  const opacity = isPlayed ? 0.5 : 1;
  const isCurrent = state === 'current';

  return (
    <View style={{
      width: size,
      height: size,
      margin: GAP / 2,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Glow layers — cross-platform (no native shadow needed) */}
      {isCurrent && (
        <>
          {/* Outermost soft glow */}
          <Animated.View
            style={[
              styles.glowLayer,
              {
                width: size + 12,
                height: size + 12,
                borderRadius: 8,
                backgroundColor: color,
                opacity: glowAnim.interpolate({
                  inputRange: [0, 0.2, 1],
                  outputRange: [0, 0.15, 0.35],
                }),
              },
            ]}
          />
          {/* Middle glow */}
          <Animated.View
            style={[
              styles.glowLayer,
              {
                width: size + 6,
                height: size + 6,
                borderRadius: 6,
                backgroundColor: color,
                opacity: glowAnim.interpolate({
                  inputRange: [0, 0.2, 1],
                  outputRange: [0, 0.25, 0.5],
                }),
              },
            ]}
          />
          {/* Bright ring */}
          <Animated.View
            style={[
              styles.glowLayer,
              {
                width: size + 4,
                height: size + 4,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: color,
                opacity: glowAnim.interpolate({
                  inputRange: [0, 0.2, 1],
                  outputRange: [0.1, 0.4, 0.8],
                }),
              },
            ]}
          />
        </>
      )}

      {/* Main cell — iOS gets bonus native shadow */}
      <Animated.View
        style={[
          isCurrent && Platform.OS === 'ios' ? {
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 10,
          } : undefined,
          {
            borderRadius: 4,
            transform: [{ scale: isCurrent ? scaleAnim : 1 }],
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.cell,
            {
              width: size - (isCurrent ? 4 : 0),
              height: size - (isCurrent ? 4 : 0),
              backgroundColor,
              opacity,
              borderWidth: isCurrent ? 2 : isPlayed ? 1.5 : 0,
              borderColor: isCurrent ? '#FFFFFF' : isPlayed ? color : 'transparent',
            },
          ]}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={400}
          activeOpacity={0.7}
        >
          {/* Beat count (1-8) — only on current (pulsing) cell */}
          {beatCount != null && state === 'current' && (
            <Text style={[
              styles.beatCount,
              { fontSize: Math.max(12, Math.round(size * 0.6)) },
            ]}>
              {beatCount}
            </Text>
          )}
          {/* Phrase beat number label — first column of each row */}
          {phraseLabel != null && state !== 'current' && (
            <Text style={[
              styles.phraseLabel,
              {
                fontSize: Math.max(8, Math.round(size * 0.35)),
                textShadowColor: 'rgba(0, 0, 0, 0.6)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 2,
              },
            ]}>
              {phraseLabel}
            </Text>
          )}
          {/* A/B repeat marker badge */}
          {repeatMarker && (
            <View style={styles.markerBadge}>
              <Text style={styles.markerText}>{repeatMarker}</Text>
            </View>
          )}
          {/* Cell note indicator dot (bottom-left) */}
          {hasNote && (
            <View style={styles.noteDot} />
          )}
          {/* Formation indicator dot (top-left) */}
          {hasFormation && (
            <View style={styles.formationDot} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const GAP = 3;

const styles = StyleSheet.create({
  cell: {
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
  },
  beatCount: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '700',
    textAlign: 'center',
  },
  phraseLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '800',
    textAlign: 'center',
  },
  rowLabelOutside: {
    position: 'absolute',
    color: 'rgba(255, 255, 255, 0.35)',
    fontWeight: '600',
    textAlign: 'right',
    width: 20,
  },
  markerBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 10,
  },
  noteDot: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#2DD4BF',  // teal-400
  },
  formationDot: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
});

export const PhraseGridCell = React.memo(PhraseGridCellInner);
export { GAP as CELL_GAP };
