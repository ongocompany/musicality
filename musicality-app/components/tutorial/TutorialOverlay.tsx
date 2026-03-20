import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import {
  useTutorialStore,
  TUTORIAL_STEPS,
  TutorialStep,
  TutorialScreen,
} from '../../stores/tutorialStore';
import { TutorialSpotlight } from './TutorialSpotlight';

// ─── Tab route mapping ──────────────────────────────────
const SCREEN_TO_TAB: Record<TutorialScreen, string> = {
  library: '/(tabs)/',
  player: '/(tabs)/player',
  community: '/(tabs)/community',
};

export function TutorialOverlay() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isActive = useTutorialStore((s) => s.isActive);
  const currentStepIndex = useTutorialStore((s) => s.currentStepIndex);
  const elementRects = useTutorialStore((s) => s.elementRects);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const prevStep = useTutorialStore((s) => s.prevStep);
  const skipTutorial = useTutorialStore((s) => s.skipTutorial);
  const totalSteps = TUTORIAL_STEPS.length;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const prevScreenRef = useRef<TutorialScreen | null>(null);

  const step: TutorialStep | undefined = TUTORIAL_STEPS[currentStepIndex];

  // ── Navigate to the correct tab when step changes ──
  useEffect(() => {
    if (!isActive || !step) return;

    const targetTab = SCREEN_TO_TAB[step.screen];
    if (targetTab && prevScreenRef.current !== step.screen) {
      // Small delay to let the overlay mount before navigating
      const timer = setTimeout(() => {
        router.navigate(targetTab as any);
      }, 100);
      prevScreenRef.current = step.screen;
      return () => clearTimeout(timer);
    }
  }, [isActive, currentStepIndex, step?.screen]);

  // ── Animate tooltip in when step changes ──
  useEffect(() => {
    if (!isActive) return;

    fadeAnim.setValue(0);
    slideAnim.setValue(30);

    // Delay animation slightly so tab transition can happen first
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);

    return () => clearTimeout(timer);
  }, [isActive, currentStepIndex]);

  // Reset screen tracking when tutorial ends
  useEffect(() => {
    if (!isActive) {
      prevScreenRef.current = null;
    }
  }, [isActive]);

  if (!isActive || !step) return null;

  // Look up measured element rect (absolute screen coordinates)
  const TAB_BAR_HEIGHT = 56;
  const measuredRect = step.targetElement
    ? elementRects[step.targetElement]
    : undefined;

  // Convert absolute screen coords to overlay-local coords
  // (overlay starts below SafeArea top inset)
  const targetRect = measuredRect
    ? {
        x: measuredRect.x,
        y: measuredRect.y - insets.top,
        width: measuredRect.width,
        height: measuredRect.height,
      }
    : null;

  // Position tooltip based on arrow direction
  const tooltipStyle = getTooltipPosition(
    targetRect,
    step.arrowDirection,
    width,
    height,
    insets,
    TAB_BAR_HEIGHT,
  );

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Dark overlay with spotlight cutout */}
      <TutorialSpotlight targetRect={targetRect} />

      {/* Tooltip card */}
      <Animated.View
        style={[
          styles.tooltipCard,
          tooltipStyle,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents="auto"
      >
        {/* Step counter */}
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              {currentStepIndex + 1} / {totalSteps}
            </Text>
          </View>
          <TouchableOpacity onPress={skipTutorial} hitSlop={12}>
            <Text style={styles.skipText}>{t('common.skip')}</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <Text style={styles.tooltipTitle}>{t(step.titleKey)}</Text>
        <Text style={styles.tooltipDesc}>{t(step.descKey)}</Text>

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          {!isFirstStep ? (
            <TouchableOpacity style={styles.prevBtn} onPress={prevStep}>
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              <Text style={styles.prevText}>{t('common.prev')}</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          <TouchableOpacity
            style={[styles.nextBtn, isLastStep && styles.finishBtn]}
            onPress={isLastStep ? skipTutorial : nextStep}
          >
            <Text style={[styles.nextText, isLastStep && styles.finishText]}>
              {isLastStep ? t('tutorial.finish') : t('common.next')}
            </Text>
            {!isLastStep && (
              <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {TUTORIAL_STEPS.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === currentStepIndex && styles.dotActive,
                idx < currentStepIndex && styles.dotDone,
              ]}
            />
          ))}
        </View>
      </Animated.View>

      {/* Pulsing pointer on target */}
      {targetRect && <PulsingPointer targetRect={targetRect} />}
    </View>
  );
}

// ─── Pulsing Pointer Animation ──────────────────────────

function PulsingPointer({
  targetRect,
}: {
  targetRect: { x: number; y: number; width: number; height: number };
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulsingRing,
        {
          left: targetRect.x + targetRect.width / 2 - 22,
          top: targetRect.y + targetRect.height / 2 - 22,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    />
  );
}

// ─── Tooltip positioning helper ─────────────────────────

function getTooltipPosition(
  targetRect: { x: number; y: number; width: number; height: number } | null,
  arrowDirection: TutorialStep['arrowDirection'],
  screenWidth: number,
  screenHeight: number,
  insets: { top: number; bottom: number },
  tabBarHeight: number,
): { top?: number; bottom?: number; left: number; right: number } {
  const TOOLTIP_MARGIN = 16;

  if (!targetRect) {
    // No target — center the tooltip
    return {
      top: screenHeight * 0.3,
      left: TOOLTIP_MARGIN,
      right: TOOLTIP_MARGIN,
    };
  }

  switch (arrowDirection) {
    case 'down':
      // Tooltip above target
      return {
        bottom: screenHeight - targetRect.y + TOOLTIP_MARGIN,
        left: TOOLTIP_MARGIN,
        right: TOOLTIP_MARGIN,
      };
    case 'up':
    default:
      // Tooltip below target
      return {
        top: targetRect.y + targetRect.height + TOOLTIP_MARGIN,
        left: TOOLTIP_MARGIN,
        right: TOOLTIP_MARGIN,
      };
  }
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  tooltipCard: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  stepBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  tooltipTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  tooltipDesc: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  prevText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: 4,
  },
  nextText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  finishBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  finishText: {
    color: '#FFFFFF',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 18,
    borderRadius: 3,
  },
  dotDone: {
    backgroundColor: Colors.primaryDark,
  },
  pulsingRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
});
