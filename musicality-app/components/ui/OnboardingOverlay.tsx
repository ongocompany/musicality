import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, FontSize } from '../../constants/theme';

interface OnboardingSlide {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  titleKey: string;
  bulletKeys: string[];
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: 'musical-notes',
    iconColor: Colors.primary,
    titleKey: 'onboarding.s1Title',
    bulletKeys: ['onboarding.s1b1', 'onboarding.s1b2', 'onboarding.s1b3'],
  },
  {
    icon: 'library',
    iconColor: '#60A5FA',
    titleKey: 'onboarding.s2Title',
    bulletKeys: ['onboarding.s2b1', 'onboarding.s2b2', 'onboarding.s2b3'],
  },
  {
    icon: 'grid',
    iconColor: '#34D399',
    titleKey: 'onboarding.s3Title',
    bulletKeys: ['onboarding.s3b1', 'onboarding.s3b2', 'onboarding.s3b3', 'onboarding.s3b4'],
  },
  {
    icon: 'play-circle',
    iconColor: '#F472B6',
    titleKey: 'onboarding.s4Title',
    bulletKeys: ['onboarding.s4b1', 'onboarding.s4b2', 'onboarding.s4b3', 'onboarding.s4b4', 'onboarding.s4b5'],
  },
  {
    icon: 'analytics',
    iconColor: '#FBBF24',
    titleKey: 'onboarding.s5Title',
    bulletKeys: ['onboarding.s5b1', 'onboarding.s5b2', 'onboarding.s5b3', 'onboarding.s5b4'],
  },
  {
    icon: 'people',
    iconColor: '#A78BFA',
    titleKey: 'onboarding.s6Title',
    bulletKeys: ['onboarding.s6b1', 'onboarding.s6b2', 'onboarding.s6b3', 'onboarding.s6b4'],
  },
];

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentPage(page);
  };

  const goToPage = (page: number) => {
    scrollRef.current?.scrollTo({ x: page * width, animated: true });
    setCurrentPage(page);
  };

  const isLastPage = currentPage === SLIDES.length - 1;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button */}
      <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
        <Text style={styles.skipText}>{t('common.skip')}</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        bounces={false}
      >
        {SLIDES.map((slide, idx) => (
          <View key={idx} style={[styles.slide, { width }]}>
            <View style={styles.iconContainer}>
              <Ionicons name={slide.icon} size={64} color={slide.iconColor} />
            </View>
            <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
            <View style={styles.bulletList}>
              {slide.bulletKeys.map((key, bi) => (
                <View key={bi} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{t(key)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom: dots + button */}
      <View style={styles.bottomBar}>
        {/* Page dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                currentPage === idx && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Next / Start button */}
        <TouchableOpacity
          style={[styles.nextButton, isLastPage && styles.startButton]}
          onPress={() => {
            if (isLastPage) {
              onComplete();
            } else {
              goToPage(currentPage + 1);
            }
          }}
        >
          <Text style={[styles.nextText, isLastPage && styles.startText]}>
            {isLastPage ? t('common.start') : t('common.next')}
          </Text>
          {!isLastPage && (
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    zIndex: 100,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 110,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl * 2,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  bulletList: {
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.md,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  bulletDot: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginRight: 8,
    lineHeight: 22,
  },
  bulletText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    flex: 1,
  },
  bottomBar: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceLight,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 24,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: 4,
    minWidth: 160,
  },
  nextText: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  startButton: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  startText: {
    color: '#FFFFFF',
  },
});
