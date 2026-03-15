import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize } from '../../constants/theme';

interface OnboardingSlide {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  bullets: string[];
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: 'musical-notes',
    iconColor: Colors.primary,
    title: 'Musicality',
    bullets: [
      'Latin Dance Count Practice Player',
      'Bachata / Salsa On1 / Salsa On2',
      'AI Auto-count & Phrase Detection',
    ],
  },
  {
    icon: 'library',
    iconColor: '#60A5FA',
    title: 'Library',
    bullets: [
      'Add music from your device or YouTube URL',
      'Tap a track to open in Player',
      'Swipe left to delete a track',
    ],
  },
  {
    icon: 'grid',
    iconColor: '#34D399',
    title: 'Beat Grid',
    bullets: [
      'Each cell = 1 beat, 8 beats per row',
      'Colors show different phrases (verse/chorus/bridge)',
      'Tap a cell to seek to that beat',
      'Long-press a cell for more options (repeat, memo, etc.)',
    ],
  },
  {
    icon: 'play-circle',
    iconColor: '#F472B6',
    title: 'Player Controls',
    bullets: [
      'Play/Pause in the center',
      'Skip back/forward between phrases',
      'Long-press back button to go to start',
      'Speed control (0.5x ~ 1.5x)',
      'Cue sound toggle (click/cowbell)',
    ],
  },
  {
    icon: 'analytics',
    iconColor: '#FBBF24',
    title: 'Waveform Timeline',
    bullets: [
      'Touch & drag to seek anywhere',
      'Colors match phrase sections',
      'White line = current position',
      'A-B loop region shown in yellow',
    ],
  },
  {
    icon: 'people',
    iconColor: '#A78BFA',
    title: 'Formation & Community',
    bullets: [
      'Create dance formations on the stage view',
      'Set keyframes at specific beats',
      'Share phrase notes with your crew',
      'Join or create dance crews',
    ],
  },
];

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
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
        <Text style={styles.skipText}>Skip</Text>
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
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <View style={styles.bulletList}>
              {slide.bullets.map((bullet, bi) => (
                <View key={bi} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
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
            {isLastPage ? 'Start!' : 'Next'}
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
