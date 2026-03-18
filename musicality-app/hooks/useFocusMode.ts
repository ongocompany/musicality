/**
 * useFocusMode — 하단 컨트롤 숨기고 그리드 극대화
 */

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Animated, PanResponder } from 'react-native';
import { useNavigation } from 'expo-router';
import { Colors } from '../constants/theme';

export function useFocusMode() {
  const navigation = useNavigation();
  const focusAnim = useRef(new Animated.Value(1)).current; // 1=normal, 0=focused
  const [focusMode, setFocusMode] = useState(false);

  const enterFocusMode = useCallback(() => {
    setFocusMode(true);
    Animated.spring(focusAnim, {
      toValue: 0,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
  }, [navigation]);

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    Animated.spring(focusAnim, {
      toValue: 1,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
    navigation.getParent()?.setOptions({
      tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border },
    });
  }, [navigation]);

  const focusSwipeResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 15 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 50 && !focusMode) enterFocusMode();
        else if (gs.dy < -50 && focusMode) exitFocusMode();
      },
    });
  }, [focusMode, enterFocusMode, exitFocusMode]);

  // Restore tab bar on unmount
  useEffect(() => {
    return () => {
      navigation.getParent()?.setOptions({
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border },
      });
    };
  }, [navigation]);

  return {
    focusMode, focusAnim,
    enterFocusMode, exitFocusMode,
    focusSwipeResponder,
  };
}
