import { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Colors, Spacing, Fonts } from '../../constants/theme';

interface CountDisplayProps {
  count: string | number;
  color: string;
  size?: 'large' | 'small';
}

// Offsets for 2px solid stroke effect
const STROKE_OFFSETS = [
  { width: -2, height: -2 },
  { width: 0, height: -2 },
  { width: 2, height: -2 },
  { width: -2, height: 0 },
  { width: 2, height: 0 },
  { width: -2, height: 2 },
  { width: 0, height: 2 },
  { width: 2, height: 2 },
  { width: -1, height: -2 },
  { width: 1, height: -2 },
  { width: -2, height: -1 },
  { width: 2, height: -1 },
  { width: -2, height: 1 },
  { width: 2, height: 1 },
  { width: -1, height: 2 },
  { width: 1, height: 2 },
];

export function CountDisplay({ count, color, size = 'large' }: CountDisplayProps) {
  const bounceAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    bounceAnim.setValue(1.3);
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [count]);

  const textStyle = size === 'large' ? styles.large : styles.small;

  return (
    <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
      <View style={styles.container}>
        {/* White stroke (8-direction offset) */}
        {STROKE_OFFSETS.map((offset, i) => (
          <Animated.Text
            key={i}
            style={[
              textStyle,
              styles.stroke,
              {
                color: 'rgba(255,255,255,0.9)',
                left: offset.width,
                top: offset.height,
              },
            ]}
          >
            {count}
          </Animated.Text>
        ))}

        {/* Layer 3: Main colored text on top */}
        <Animated.Text style={[textStyle, { color }]}>
          {count}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  stroke: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  large: {
    fontSize: 140,
    fontFamily: Fonts.display,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    padding: 14,
  },
  small: {
    fontSize: 56,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    padding: 5,
  },
});
