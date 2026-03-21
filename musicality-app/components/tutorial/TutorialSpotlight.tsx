import React from 'react';
import { View, StyleSheet } from 'react-native';

interface SpotlightProps {
  /** Absolute rect to keep transparent. null = full-screen dim. */
  targetRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.65)';
const SPOTLIGHT_PADDING = 8; // extra padding around the target
const SPOTLIGHT_RADIUS = 12;

/**
 * Creates a dark overlay with a rectangular "hole" around the target area.
 * Uses 4 non-overlapping rectangles to avoid opacity stacking.
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │       TOP            │
 *   ├────┬────────┬────────┤
 *   │ L  │ (clear)│   R    │
 *   ├────┴────────┴────────┤
 *   │      BOTTOM          │
 *   └──────────────────────┘
 */
export function TutorialSpotlight({ targetRect }: SpotlightProps) {
  if (!targetRect) {
    // No target — light dim so content stays partially visible
    return (
      <View style={styles.lightOverlay} pointerEvents="none" />
    );
  }

  const { x, y, width, height } = {
    x: Math.max(0, targetRect.x - SPOTLIGHT_PADDING),
    y: Math.max(0, targetRect.y - SPOTLIGHT_PADDING),
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Top rect */}
      <View
        style={[styles.dimRect, { top: 0, left: 0, right: 0, height: y }]}
        pointerEvents="auto"
      />
      {/* Left rect */}
      <View
        style={[
          styles.dimRect,
          { top: y, left: 0, width: x, height: height },
        ]}
        pointerEvents="auto"
      />
      {/* Right rect */}
      <View
        style={[
          styles.dimRect,
          { top: y, left: x + width, right: 0, height: height },
        ]}
        pointerEvents="auto"
      />
      {/* Bottom rect */}
      <View
        style={[
          styles.dimRect,
          { top: y + height, left: 0, right: 0, bottom: 0 },
        ]}
        pointerEvents="auto"
      />
      {/* Spotlight border (visual highlight) */}
      <View
        style={[
          styles.spotlightBorder,
          {
            left: x,
            top: y,
            width: width,
            height: height,
            borderRadius: SPOTLIGHT_RADIUS,
          },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: OVERLAY_COLOR,
  },
  lightOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  dimRect: {
    position: 'absolute',
    backgroundColor: OVERLAY_COLOR,
  },
  spotlightBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 215, 0, 0.6)',
  },
});
