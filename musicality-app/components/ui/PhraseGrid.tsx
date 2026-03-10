import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, LayoutChangeEvent, Modal, Pressable, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, getPhraseColor } from '../../constants/theme';
import { CountInfo } from '../../utils/beatCounter';
import { PhraseMap } from '../../types/analysis';
import { PhraseGridCell, CELL_GAP, CellState } from './PhraseGridCell';

interface PhraseGridProps {
  countInfo: CountInfo | null;
  phraseMap: PhraseMap | null;
  hasAnalysis: boolean;
  beats: number[];
  isPlaying: boolean;
  onTapBeat: (globalBeatIndex: number) => void;
  onStartPhraseHere: (globalBeatIndex: number) => void;
  onSetLoopPoint: (beatTimeMs: number) => void;
  onClearLoop: () => void;
  onSeekAndPlay: (beatTimeMs: number) => void;
  onMergeWithPrevious: (globalBeatIndex: number) => void;
  loopStart: number | null;
  loopEnd: number | null;
  rows?: number; // default 8
  scrollMode?: boolean; // rhythm-game style row scrolling
}

const COLS = 8;
const DEFAULT_ROWS = 8;
const MIN_CELL_SIZE = 20;
const SCROLL_ANCHOR_ROW = 2; // current beat row fixed at 3rd display row (0-indexed)

export function PhraseGrid({
  countInfo, phraseMap, hasAnalysis, beats, isPlaying,
  onTapBeat, onStartPhraseHere, onSetLoopPoint, onClearLoop,
  onSeekAndPlay, onMergeWithPrevious,
  loopStart, loopEnd, rows, scrollMode,
}: PhraseGridProps) {
  const rowCount = rows ?? DEFAULT_ROWS;
  const CELLS_PER_PAGE = COLS * rowCount;
  const [containerWidth, setContainerWidth] = useState(0);
  const [flashCellIndex, setFlashCellIndex] = useState<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuCellIndex, setMenuCellIndex] = useState<number>(-1);

  // Repeat selection mode ("selecting B")
  const [repeatSelectMode, setRepeatSelectMode] = useState(false);

  // Refresh animation (phrase change OR page/row change)
  const prevPhraseIndexRef = useRef<number>(-1);
  const prevPageIndexRef = useRef<number>(0);
  const refreshAnim = useRef(new Animated.Value(1)).current;

  const triggerRefresh = useCallback(() => {
    refreshAnim.setValue(0);
    Animated.timing(refreshAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [refreshAnim]);

  // Cleanup flash timeout
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // Reset repeat select mode when loop is cleared externally
  useEffect(() => {
    if (loopStart == null && loopEnd == null) {
      setRepeatSelectMode(false);
    }
  }, [loopStart, loopEnd]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // Current phrase (for page mode)
  const currentPhrase = useMemo(() => {
    if (!phraseMap || !countInfo || countInfo.phraseIndex < 0) return null;
    return phraseMap.phrases[countInfo.phraseIndex] ?? null;
  }, [phraseMap, countInfo?.phraseIndex]);

  // Actual beats in current phrase (page mode)
  const actualBeats = currentPhrase
    ? currentPhrase.endBeatIndex - currentPhrase.startBeatIndex
    : CELLS_PER_PAGE;

  // Local beat index within current phrase (0-based, for page mode)
  const localBeatIndex = useMemo(() => {
    if (!countInfo || !currentPhrase) return -1;
    return countInfo.beatIndex - currentPhrase.startBeatIndex;
  }, [countInfo?.beatIndex, currentPhrase]);

  // Global beat index (for scroll mode cross-phrase view)
  const globalBeatIndex = countInfo?.beatIndex ?? -1;
  const totalBeats = beats.length;

  // ─── Pagination / Scroll logic ───
  // Scroll mode: global beat space (continuous across phrases)
  // Page mode: phrase-local beat space
  const currentBeatRow = scrollMode
    ? (globalBeatIndex >= 0 ? Math.floor(globalBeatIndex / COLS) : 0)
    : (localBeatIndex >= 0 ? Math.floor(localBeatIndex / COLS) : 0);

  const startDataRow = useMemo(() => {
    if (scrollMode) {
      if (globalBeatIndex < 0) return 0;
      // Allow negative so current beat always stays at SCROLL_ANCHOR_ROW
      return currentBeatRow - SCROLL_ANCHOR_ROW;
    }
    if (localBeatIndex < 0) return 0;
    const pageIdx = Math.floor(localBeatIndex / CELLS_PER_PAGE);
    return pageIdx * rowCount;
  }, [scrollMode, globalBeatIndex, localBeatIndex, currentBeatRow, CELLS_PER_PAGE, rowCount]);

  const pageStartBeat = startDataRow * COLS;

  // Beat index within current display window (0-based)
  const pageBeatIndex = scrollMode
    ? (globalBeatIndex >= 0 ? globalBeatIndex - pageStartBeat : -1)
    : (localBeatIndex >= 0 ? localBeatIndex - pageStartBeat : -1);

  // Total beats for bounds: global in scroll, phrase-local in page
  const effectiveTotalBeats = scrollMode ? totalBeats : actualBeats;
  const beatsOnThisPage = Math.max(0, Math.min(CELLS_PER_PAGE, effectiveTotalBeats - pageStartBeat));

  // For page indicator
  const pageIndex = scrollMode
    ? currentBeatRow
    : (localBeatIndex >= 0 ? Math.floor(localBeatIndex / CELLS_PER_PAGE) : 0);

  // Detect phrase change OR row/page scroll → trigger refresh
  useEffect(() => {
    if (!countInfo || countInfo.totalPhrases === 0) return;
    const phraseChanged = prevPhraseIndexRef.current !== -1 &&
      prevPhraseIndexRef.current !== countInfo.phraseIndex;
    const scrollChanged = prevPageIndexRef.current !== startDataRow;

    if (phraseChanged || scrollChanged) {
      triggerRefresh();
    }
    prevPhraseIndexRef.current = countInfo.phraseIndex;
    prevPageIndexRef.current = startDataRow;
  }, [countInfo?.phraseIndex, startDataRow]);

  // Cell size (width-based, uniform spacing)
  const cellSize = useMemo(() => {
    if (containerWidth <= 0) return 0;
    const margins = COLS * CELL_GAP;
    const available = containerWidth - margins;
    return Math.max(Math.floor(available / COLS), MIN_CELL_SIZE);
  }, [containerWidth]);

  // Phrase color (page mode: single color for entire grid)
  const phraseColor = useMemo(() => {
    if (countInfo && countInfo.totalPhrases > 0) {
      return getPhraseColor(countInfo.phraseIndex);
    }
    return Colors.textMuted;
  }, [countInfo?.phraseIndex, countInfo?.totalPhrases]);

  // Cell state (relative to display window)
  const getCellState = useCallback((i: number): CellState => {
    const dataBeatIndex = pageStartBeat + i;
    if (dataBeatIndex < 0) return 'hidden';
    if (dataBeatIndex >= effectiveTotalBeats) return 'hidden';
    if (!scrollMode && i >= beatsOnThisPage) return 'hidden';
    if (pageBeatIndex < 0) return 'upcoming';
    if (i === pageBeatIndex) return 'current';
    if (i < pageBeatIndex) return 'played';
    return 'upcoming';
  }, [pageBeatIndex, beatsOnThisPage, pageStartBeat, effectiveTotalBeats, scrollMode]);

  // ─── Cell-to-global-beat resolution ───
  const cellToGlobalBeat = useCallback((cellIndex: number): number => {
    const dataBeat = pageStartBeat + cellIndex;
    if (scrollMode) {
      return (dataBeat >= 0 && dataBeat < totalBeats) ? dataBeat : -1;
    }
    if (!currentPhrase) return -1;
    if (dataBeat < 0 || dataBeat >= actualBeats) return -1;
    return currentPhrase.startBeatIndex + dataBeat;
  }, [scrollMode, currentPhrase, pageStartBeat, actualBeats, totalBeats]);

  // Per-cell color: scroll mode shows multiple phrase colors
  const getCellPhraseColor = useCallback((cellIndex: number): string => {
    if (!scrollMode) return phraseColor;
    if (!phraseMap) return phraseColor;
    const globalBeat = pageStartBeat + cellIndex;
    if (globalBeat < 0 || globalBeat >= totalBeats) return Colors.textMuted;
    for (let p = 0; p < phraseMap.phrases.length; p++) {
      const phrase = phraseMap.phrases[p];
      if (globalBeat >= phrase.startBeatIndex && globalBeat < phrase.endBeatIndex) {
        return getPhraseColor(p);
      }
    }
    return Colors.textMuted;
  }, [scrollMode, phraseMap, pageStartBeat, totalBeats, phraseColor]);

  // Per-cell row label: first column shows eight-count row number (1,2,3,4) — resets at phrase boundary
  const getCellRowLabel = useCallback((cellIndex: number): string | null => {
    if (cellIndex % COLS !== 0) return null; // only first column
    const globalBeat = cellToGlobalBeat(cellIndex);
    if (globalBeat < 0) return null;
    if (!phraseMap) return null;
    for (const phrase of phraseMap.phrases) {
      if (globalBeat >= phrase.startBeatIndex && globalBeat < phrase.endBeatIndex) {
        const beatInPhrase = globalBeat - phrase.startBeatIndex;
        return String(Math.floor(beatInPhrase / COLS) + 1);
      }
    }
    return null;
  }, [cellToGlobalBeat, phraseMap]);

  // ─── Tap handler ───
  const handleCellTap = useCallback((cellIndex: number) => {
    const globalBeat = cellToGlobalBeat(cellIndex);
    if (globalBeat < 0) return;

    // Flash effect
    setFlashCellIndex(cellIndex);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashCellIndex(null), 300);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!isPlaying && globalBeat < beats.length) {
      onSeekAndPlay(beats[globalBeat] * 1000);
    } else {
      onTapBeat(globalBeat);
    }
  }, [cellToGlobalBeat, isPlaying, beats, onSeekAndPlay, onTapBeat]);

  // ─── Long-press handler ───
  const handleCellLongPress = useCallback((cellIndex: number) => {
    const globalBeat = cellToGlobalBeat(cellIndex);
    if (globalBeat < 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (repeatSelectMode) {
      if (globalBeat < beats.length) {
        const beatTimeMs = beats[globalBeat] * 1000;
        onSetLoopPoint(beatTimeMs);
      }
      setRepeatSelectMode(false);
    } else {
      setMenuCellIndex(cellIndex);
      setMenuVisible(true);
    }
  }, [cellToGlobalBeat, repeatSelectMode, beats, onSetLoopPoint]);

  // ─── Context menu helpers ───
  const menuGlobalBeat = useMemo(() => {
    if (menuCellIndex < 0) return -1;
    return cellToGlobalBeat(menuCellIndex);
  }, [menuCellIndex, cellToGlobalBeat]);

  const handleStartPhraseHere = useCallback(() => {
    if (menuGlobalBeat < 0) return;
    onStartPhraseHere(menuGlobalBeat);
    setMenuVisible(false);
  }, [menuGlobalBeat, onStartPhraseHere]);

  const handleRepeatFromHere = useCallback(() => {
    if (menuGlobalBeat < 0 || menuGlobalBeat >= beats.length) return;
    onSetLoopPoint(beats[menuGlobalBeat] * 1000);
    setRepeatSelectMode(true);
    setMenuVisible(false);
  }, [menuGlobalBeat, beats, onSetLoopPoint]);

  const handleClearLoop = useCallback(() => {
    onClearLoop();
    setRepeatSelectMode(false);
    setMenuVisible(false);
  }, [onClearLoop]);

  // ─── Merge with previous phrase ───
  const handleMergeWithPrevious = useCallback(() => {
    if (menuGlobalBeat < 0) return;
    onMergeWithPrevious(menuGlobalBeat);
    setMenuVisible(false);
  }, [menuGlobalBeat, onMergeWithPrevious]);

  // Is the menu cell the first beat of a phrase?
  const isFirstCellOfPhrase = useMemo(() => {
    if (menuGlobalBeat < 0 || !phraseMap) return false;
    return phraseMap.phrases.some(p => p.startBeatIndex === menuGlobalBeat);
  }, [menuGlobalBeat, phraseMap]);

  // Can merge: first cell of a non-first phrase
  const menuPhraseIndex = useMemo(() => {
    if (menuGlobalBeat < 0 || !phraseMap) return -1;
    return phraseMap.phrases.findIndex(p =>
      menuGlobalBeat >= p.startBeatIndex && menuGlobalBeat < p.endBeatIndex
    );
  }, [menuGlobalBeat, phraseMap]);
  const canMerge = isFirstCellOfPhrase && menuPhraseIndex > 0;

  // ─── Repeat marker calculation ───
  const getRepeatMarker = useCallback((cellIndex: number): 'A' | 'B' | null => {
    if (!beats.length) return null;
    const globalBeat = cellToGlobalBeat(cellIndex);
    if (globalBeat < 0 || globalBeat >= beats.length) return null;

    const beatTimeMs = beats[globalBeat] * 1000;
    // Check within +-20ms tolerance for floating point
    if (loopStart != null && Math.abs(beatTimeMs - loopStart) < 20) return 'A';
    if (loopEnd != null && Math.abs(beatTimeMs - loopEnd) < 20) return 'B';
    return null;
  }, [cellToGlobalBeat, beats, loopStart, loopEnd]);

  // Animation interpolations
  const gridOpacity = refreshAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.5, 1, 1],
  });
  const gridScale = refreshAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.97, 1, 1],
  });

  // Total pages/rows for indicator
  const totalDataRows = Math.ceil(effectiveTotalBeats / COLS);
  const totalPages = scrollMode
    ? totalDataRows
    : Math.ceil(actualBeats / CELLS_PER_PAGE);

  // ─── No analysis placeholder ───
  if (!hasAnalysis) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderGrid} onLayout={onLayout}>
          {containerWidth > 0 && Array.from({ length: CELLS_PER_PAGE }, (_, i) => (
                <PhraseGridCell
                  key={i}
                  state="upcoming"
                  color={Colors.surfaceLight}
                  size={cellSize}
                  isFlashing={false}
                  onPress={() => {}}
                  onLongPress={() => {}}
                />
          ))}
          <View style={styles.placeholderOverlay}>
            <Text style={styles.placeholderText}>Analyze to see counts</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* "Selecting B" hint */}
      {repeatSelectMode && (
        <View style={styles.repeatHint}>
          <Text style={styles.repeatHintText}>
            Long-press another cell to set repeat end point
          </Text>
        </View>
      )}

      {/* Page/row indicator (only when content exceeds one screen) */}
      {(scrollMode ? totalDataRows > 1 : totalPages > 1) && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            {scrollMode
              ? `${currentBeatRow + 1} / ${totalDataRows}`
              : `${pageIndex + 1} / ${totalPages}`}
          </Text>
        </View>
      )}

      <Animated.View
        onLayout={onLayout}
        style={[
          styles.grid,
          { opacity: gridOpacity, transform: [{ scale: gridScale }] },
        ]}
      >
        {containerWidth > 0 && cellSize > 0 && Array.from({ length: CELLS_PER_PAGE }, (_, i) => (
              <PhraseGridCell
                key={i}
                state={getCellState(i)}
                color={getCellPhraseColor(i)}
                size={cellSize}
                isFlashing={flashCellIndex === i}
                onPress={() => handleCellTap(i)}
                onLongPress={() => handleCellLongPress(i)}
                repeatMarker={getRepeatMarker(i)}
                rowLabel={getCellRowLabel(i)}
              />
        ))}
      </Animated.View>

      {/* Context menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Beat {menuCellIndex + 1}</Text>

            {/* Start new phrase here — only when paused */}
            {!isPlaying && (
              <TouchableOpacity style={styles.menuOption} onPress={handleStartPhraseHere}>
                <Text style={styles.menuOptionText}>Start new phrase here</Text>
              </TouchableOpacity>
            )}

            {/* Repeat from here — always available */}
            <TouchableOpacity style={styles.menuOption} onPress={handleRepeatFromHere}>
              <Text style={styles.menuOptionText}>Repeat from here</Text>
            </TouchableOpacity>

            {/* Merge with previous — paused + first cell of non-first phrase */}
            {!isPlaying && canMerge && (
              <TouchableOpacity style={styles.menuOption} onPress={handleMergeWithPrevious}>
                <Text style={styles.menuOptionText}>Merge with previous phrase</Text>
              </TouchableOpacity>
            )}

            {/* Clear repeat — when loop is set */}
            {(loopStart != null || loopEnd != null) && (
              <TouchableOpacity
                style={[styles.menuOption, styles.menuOptionDanger]}
                onPress={handleClearLoop}
              >
                <Text style={[styles.menuOptionText, styles.menuOptionDangerText]}>
                  Clear repeat
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pageIndicator: {
    alignItems: 'flex-end',
    marginBottom: 4,
    paddingHorizontal: Spacing.xs,
  },
  pageText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  placeholderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    position: 'relative',
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.6)',
    borderRadius: 8,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  // Context menu
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.md,
    minWidth: 240,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  menuTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  menuOption: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
  },
  menuOptionText: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  menuOptionDanger: {
    marginTop: Spacing.xs,
  },
  menuOptionDangerText: {
    color: Colors.error,
  },
  // Repeat hint
  repeatHint: {
    alignItems: 'center',
    marginBottom: Spacing.xs,
    paddingVertical: 4,
    backgroundColor: 'rgba(187, 134, 252, 0.15)',
    borderRadius: 8,
  },
  repeatHintText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
