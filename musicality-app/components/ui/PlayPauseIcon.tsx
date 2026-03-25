import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  isPlaying: boolean;
  size?: number;
  color?: string;
}

/**
 * Custom Play/Pause icon using pure RN Views.
 * - Play: CSS border triangle, optically centered (10% right shift)
 * - Pause: two rounded vertical bars
 */
export function PlayPauseIcon({ isPlaying, size = 24, color = '#FFFFFF' }: Props) {
  if (isPlaying) {
    const barW = Math.round(size * 0.24);
    const barH = Math.round(size * 0.7);
    const gap = Math.round(size * 0.14);
    const r = Math.round(barW * 0.35);
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <View style={{ flexDirection: 'row', gap }}>
          <View style={{ width: barW, height: barH, borderRadius: r, backgroundColor: color }} />
          <View style={{ width: barW, height: barH, borderRadius: r, backgroundColor: color }} />
        </View>
      </View>
    );
  }

  // Play: border triangle with optical center correction
  const triH = Math.round(size * 0.75);
  const triW = Math.round(size * 0.62);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={{
          marginLeft: size * 0.1,
          width: 0,
          height: 0,
          borderLeftWidth: triW,
          borderTopWidth: triH / 2,
          borderBottomWidth: triH / 2,
          borderLeftColor: color,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
