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
}

const COLS = 8;
const HALF_COLS = 4; // visual grouping: 1234 | 5678
const COL_GROUP_GAP = 6; // gap between the two 4-beat groups
const DEFAULT_ROWS = 8;
const MIN_CELL_SIZE = 20;

export function PhraseGrid({
  countInfo, phraseMap, hasAnalysis, beats, isPlaying,
  onTapBeat, onStartPhraseHere, onSetLoopPoint, onClearLoop,
  onSeekAndPlay, onMergeWithPrevious,
  loopStart, loopEnd, rows,
}: PhraseGridProps) {
  const CELLS_PER_PAGE = COLS * (rows ?? DEFAULT_ROWS);
  const [containerWidth, setContainerWidth] = useState(0);
  const [flashCellIndex, setFlashCellIndex] = useState<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuCellIndex, setMenuCellIndex] = useState<number>(-1);

  // Repeat selection mode ("selecting B")
  const [repeatSelectMode, setRepeatSelectMode] = useState(false);

  // Refresh animation (phrase change OR page change)
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

  // Current phrase
  const currentPhrase = useMemo(() => {
    if (!phraseMap || !countInfo || countInfo.phraseIndex < 0) return null;
    return phraseMap.phrases[countInfo.phraseIndex] ?? null;
  }, [phraseMap, countInfo?.phraseIndex]);

  // Actual beats in current phrase
  const actualBeats = currentPhrase
    ? currentPhrase.endBeatIndex - currentPhrase.startBeatIndex
    : CELLS_PER_PAGE;

  // Local beat index within current phrase (0-based)
  const localBeatIndex = useMemo(() => {
    if (!countInfo || !currentPhrase) return -1;
    return countInfo.beatIndex - currentPhrase.startBeatIndex;
  }, [countInfo?.beatIndex, currentPhrase]);

  // ─── Pagination for long phrases ───
  const pageIndex = localBeatIndex >= 0
    ? Math.floor(localBeatIndex / CELLS_PER_PAGE)
    : 0;
  const pageStartBeat = pageIndex * CELLS_PER_PAGE;

  // Beat index within current page (0-based)
  const pageBeatIndex = localBeatIndex >= 0
    ? localBeatIndex - pageStartBeat
    : -1;

  // How many beats remain on this page
  const beatsOnThisPage = Math.min(CELLS_PER_PAGE, actualBeats - pageStartBeat);

  // Detect phrase change OR page change → trigger refresh
  useEffect(() => {
    if (!countInfo || countInfo.totalPhrases === 0) return;
    const phraseChanged = prevPhraseIndexRef.current !== -1 &&
      prevPhraseIndexRef.current !== countInfo.phraseIndex;
    const pageChanged = prevPageIndexRef.current !== pageIndex;

    if (phraseChanged || pageChanged) {
      triggerRefresh();
    }
    prevPhraseIndexRef.current = countInfo.phraseIndex;
    prevPageIndexRef.current = pageIndex;
  }, [countInfo?.phraseIndex, pageIndex]);

  // Cell size (width-based, 4+4 grouped layout)
  const rowCount = rows ?? DEFAULT_ROWS;
  const groupGapsPerRow = Math.floor((COLS - 1) / HALF_COLS); // 1 group gap per row
  const cellSize = useMemo(() => {
    if (containerWidth <= 0) return 0;
    const margins = COLS * CELL_GAP + groupGapsPerRow * COL_GROUP_GAP;
    const available = containerWidth - margins;
    return Math.max(Math.floor(available / COLS), MIN_CELL_SIZE);
  }, [containerWidth]);

  // Phrase color
  const phraseColor = useMemo(() => {
    if (countInfo && countInfo.totalPhrases > 0) {
      return getPhraseColor(countInfo.phraseIndex);
    }
    return Colors.textMuted;
  }, [countInfo?.phraseIndex, countInfo?.totalPhrases]);

  // Cell state (page-relative)
  const getCellState = useCallback((i: number): CellState => {
    if (i >= beatsOnThisPage) return 'hidden';
    if (pageBeatIndex < 0) return 'upcoming';
    if (i === pageBeatIndex) return 'current';
    if (i < pageBeatIndex) return 'played';
    return 'upcoming';
  }, [pageBeatIndex, beatsOnThisPage]);

  // ─── Tap handler (maps page-local → global) ───
  const handleCellTap = useCallback((cellIndex: number) => {
    if (!currentPhrase) return;
    const phraseLocalIndex = pageStartBeat + cellIndex;
    if (phraseLocalIndex >= actualBeats) return;

    const globalBeatIndex = currentPhrase.startBeatIndex + phraseLocalIndex;

    // Flash effect
    setFlashCellIndex(cellIndex);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashCellIndex(null), 300);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!isPlaying && beats.length > 0 && globalBeatIndex < beats.length) {
      // Paused: seek to this beat and start playback (preview)
      onSeekAndPlay(beats[globalBeatIndex] * 1000);
    } else {
      // Playing: existing downbeat adjustment
      onTapBeat(globalBeatIndex);
    }
  }, [currentPhrase, pageStartBeat, actualBeats, isPlaying, beats, onSeekAndPlay, onTapBeat]);

  // ─── Long-press handler ───
  const handleCellLongPress = useCallback((cellIndex: number) => {
    if (!currentPhrase) return;
    const phraseLocalIndex = pageStartBeat + cellIndex;
    if (phraseLocalIndex >= actualBeats) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (repeatSelectMode) {
      // In "selecting B" mode — directly set B point
      const globalBeatIndex = currentPhrase.startBeatIndex + phraseLocalIndex;
      if (globalBeatIndex < beats.length) {
        const beatTimeMs = beats[globalBeatIndex] * 1000;
        onSetLoopPoint(beatTimeMs); // sets B (loop end)
      }
      setRepeatSelectMode(false);
    } else {
      // Show context menu
      setMenuCellIndex(cellIndex);
      setMenuVisible(true);
    }
  }, [currentPhrase, pageStartBeat, actualBeats, repeatSelectMode, beats, onSetLoopPoint]);

  // ─── Context menu actions ───
  const handleStartPhraseHere = useCallback(() => {
    if (!currentPhrase) return;
    const phraseLocalIndex = pageStartBeat + menuCellIndex;
    const globalBeatIndex = currentPhrase.startBeatIndex + phraseLocalIndex;
    onStartPhraseHere(globalBeatIndex);
    setMenuVisible(false);
  }, [menuCellIndex, currentPhrase, pageStartBeat, onStartPhraseHere]);

  const handleRepeatFromHere = useCallback(() => {
    if (!currentPhrase) return;
    const phraseLocalIndex = pageStartBeat + menuCellIndex;
    const globalBeatIndex = currentPhrase.startBeatIndex + phraseLocalIndex;
    if (globalBeatIndex >= beats.length) return;

    const beatTimeMs = beats[globalBeatIndex] * 1000;
    onSetLoopPoint(beatTimeMs); // sets A (loop start)
    setRepeatSelectMode(true);
    setMenuVisible(false);
  }, [menuCellIndex, currentPhrase, pageStartBeat, beats, onSetLoopPoint]);

  const handleClearLoop = useCallback(() => {
    onClearLoop();
    setRepeatSelectMode(false);
    setMenuVisible(false);
  }, [onClearLoop]);

  // ─── Merge with previous phrase ───
  const handleMergeWithPrevious = useCallback(() => {
    if (!currentPhrase) return;
    const globalBeatIndex = currentPhrase.startBeatIndex;
    onMergeWithPrevious(globalBeatIndex);
    setMenuVisible(false);
  }, [currentPhrase, onMergeWithPrevious]);

  // Is the menu cell the first beat of current phrase?
  const isFirstCellOfPhrase = useMemo(() => {
    if (menuCellIndex < 0 || !currentPhrase) return false;
    const phraseLocalIndex = pageStartBeat + menuCellIndex;
    return phraseLocalIndex === 0;
  }, [menuCellIndex, currentPhrase, pageStartBeat]);

  // Can merge: first cell of phrase AND not the very first phrase
  const canMerge = isFirstCellOfPhrase && countInfo != null && countInfo.phraseIndex > 0;

  // ─── Repeat marker calculation ───
  const getRepeatMarker = useCallback((cellIndex: number): 'A' | 'B' | null => {
    if (!currentPhrase || !beats.length) return null;
    const phraseLocalIndex = pageStartBeat + cellIndex;
    const globalBeatIndex = currentPhrase.startBeatIndex + phraseLocalIndex;
    if (globalBeatIndex >= beats.length) return null;

    const beatTimeMs = beats[globalBeatIndex] * 1000;
    // Check within +-20ms tolerance for floating point
    if (loopStart != null && Math.abs(beatTimeMs - loopStart) < 20) return 'A';
    if (loopEnd != null && Math.abs(beatTimeMs - loopEnd) < 20) return 'B';
    return null;
  }, [currentPhrase, pageStartBeat, beats, loopStart, loopEnd]);

  // Animation interpolations
  const gridOpacity = refreshAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.5, 1, 1],
  });
  const gridScale = refreshAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.97, 1, 1],
  });

  // Total pages for indicator
  const totalPages = Math.ceil(actualBeats / CELLS_PER_PAGE);

  // ─── No analysis placeholder ───
  if (!hasAnalysis) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderGrid} onLayout={onLayout}>
          {containerWidth > 0 && Array.from({ length: CELLS_PER_PAGE }, (_, i) => {
            const colInRow = i % COLS;
            return (
              <React.Fragment key={i}>
                {colInRow === HALF_COLS && (
                  <View style={{ width: COL_GROUP_GAP }} />
                )}
                <PhraseGridCell
                  state="upcoming"
                  color={Colors.surfaceLight}
                  size={cellSize}
                  isFlashing={false}
                  onPress={() => {}}
                  onLongPress={() => {}}
                />
              </React.Fragment>
            );
          })}
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

      {/* Page indicator (only when multi-page) */}
      {totalPages > 1 && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            {pageIndex + 1} / {totalPages}
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
        {containerWidth > 0 && cellSize > 0 && Array.from({ length: CELLS_PER_PAGE }, (_, i) => {
          const colInRow = i % COLS;
          return (
            <React.Fragment key={i}>
              {colInRow === HALF_COLS && (
                <View style={{ width: COL_GROUP_GAP }} />
              )}
              <PhraseGridCell
                state={getCellState(i)}
                color={phraseColor}
                size={cellSize}
                isFlashing={flashCellIndex === i}
                onPress={() => handleCellTap(i)}
                onLongPress={() => handleCellLongPress(i)}
                repeatMarker={getRepeatMarker(i)}
              />
            </React.Fragment>
          );
        })}
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
