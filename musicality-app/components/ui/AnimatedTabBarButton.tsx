import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityRole?: string;
  accessibilityState?: any;
  style?: any;
}

export function AnimatedTabBarButton({ children, onPress, onLongPress, style, ...rest }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.container, style]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
