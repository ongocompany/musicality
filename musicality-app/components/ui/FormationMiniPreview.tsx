import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { DancerDef, DancerPosition } from '../../types/formation';

interface FormationMiniPreviewProps {
  positions: DancerPosition[];
  dancers: DancerDef[];
  size: number;           // container size (matches cell size)
  isKeyframe?: boolean;   // show distinct border if it's an actual keyframe
}

/**
 * Tiny formation preview rendered inside a PhraseGrid cell.
 * Shows dancer positions as 2-3px colored dots.
 */
export function FormationMiniPreview({
  positions,
  dancers,
  size,
  isKeyframe = false,
}: FormationMiniPreviewProps) {
  const dots = useMemo(() => {
    const dotSize = Math.max(2, Math.min(4, size / 12));
    return positions.map((pos) => {
      const dancer = dancers.find((d) => d.id === pos.dancerId);
      return {
        key: pos.dancerId,
        left: pos.x * size - dotSize / 2,
        top: pos.y * size - dotSize / 2,
        size: dotSize,
        color: dancer?.color ?? 'rgba(255,255,255,0.5)',
      };
    });
  }, [positions, dancers, size]);

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size },
        isKeyframe && styles.keyframeBorder,
      ]}
      pointerEvents="none"
    >
      {dots.map((dot) => (
        <View
          key={dot.key}
          style={{
            position: 'absolute',
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size / 2,
            backgroundColor: dot.color,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  keyframeBorder: {
    borderWidth: 1,
    borderColor: 'rgba(3, 218, 198, 0.4)',
    borderRadius: 2,
  },
});
