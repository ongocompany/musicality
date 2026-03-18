/**
 * useFocusMode — 하단 컨트롤 숨기고 그리드 극대화
 * LayoutAnimation for smooth native-thread layout changes during video playback
 */

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { LayoutAnimation, Platform, UIManager, PanResponder } from 'react-native';
import { useNavigation } from 'expo-router';
import { Colors } from '../constants/theme';

// Android requires this flag for LayoutAnimation
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ANIM_CONFIG = LayoutAnimation.create(
  250,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

export function useFocusMode(autoHideMs?: number) {
  const navigation = useNavigation();
  const [focusMode, setFocusMode] = useState(false);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoHide = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const enterFocusMode = useCallback(() => {
    clearAutoHide();
    LayoutAnimation.configureNext(ANIM_CONFIG);
    setFocusMode(true);
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
  }, [navigation, clearAutoHide]);

  const exitFocusMode = useCallback(() => {
    LayoutAnimation.configureNext(ANIM_CONFIG);
    setFocusMode(false);
    navigation.getParent()?.setOptions({
      tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border },
    });
    if (autoHideMs && autoHideMs > 0) {
      clearAutoHide();
      autoHideTimerRef.current = setTimeout(() => enterFocusMode(), autoHideMs);
    }
  }, [navigation, autoHideMs, clearAutoHide, enterFocusMode]);

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
      clearAutoHide();
      navigation.getParent()?.setOptions({
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border },
      });
    };
  }, [navigation, clearAutoHide]);

  const scheduleAutoHide = useCallback(() => {
    if (autoHideMs && autoHideMs > 0) {
      clearAutoHide();
      autoHideTimerRef.current = setTimeout(() => enterFocusMode(), autoHideMs);
    }
  }, [autoHideMs, clearAutoHide, enterFocusMode]);

  return {
    focusMode,
    enterFocusMode, exitFocusMode,
    scheduleAutoHide,
    focusSwipeResponder,
  };
}
