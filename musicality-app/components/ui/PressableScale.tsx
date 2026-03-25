import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp } from 'react-native';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleDown?: number;
  disabled?: boolean;
}

/**
 * Generic pressable with scale-down animation.
 * Use instead of TouchableOpacity for a more tactile feel.
 *
 *   <PressableScale onPress={handleTap} scaleDown={0.95}>
 *     <YourContent />
 *   </PressableScale>
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  scaleDown = 0.95,
  disabled = false,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleDown,
      friction: 8,
      tension: 300,
      useNativeDriver: true,
    }).start();
  }, [scaleDown]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[{ opacity: disabled ? 0.5 : 1 }]}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
