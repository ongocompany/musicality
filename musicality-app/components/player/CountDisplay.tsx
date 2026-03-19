import { useRef, useEffect } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Colors, Spacing } from '../../constants/theme';

interface CountDisplayProps {
  count: string | number;
  color: string;
  size?: 'large' | 'small';
}

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

  return (
    <Animated.Text
      style={[
        size === 'large' ? styles.large : styles.small,
        {
          color,
          transform: [{ scale: bounceAnim }],
        },
      ]}
    >
      {count}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  large: {
    fontSize: 140,
    fontWeight: '900',
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
