import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Modal, Pressable, TouchableOpacity, TextInput, Keyboard, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, getPhraseColor } from '../../constants/theme';
import { CountInfo } from '../../utils/beatCounter';
import { PhraseMap } from '../../types/analysis';
import { PhraseGridCell, CELL_GAP, CellState } from './PhraseGridCell';
import { FormationData } from '../../types/formation';
import { hasKeyframeAtBeat } from '../../utils/formationInterpolator';

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
  onSeekOnly: (beatTimeMs: number) => void;  // seek without playing (paused tap)
  onMergeWithPrevious: (globalBeatIndex: number) => void;
  loopStart: number | null;
  loopEnd: number | null;
  rows?: number; // visible rows (default 8)
  scrollMode?: boolean; // kept for API compat — grid is always scrollable now
  // Cell notes (per-beat memos)
  cellNotes?: Record<string, string>;  // beatIndex(string) → note
  onSetCellNote?: (beatIndex: number, note: string) => void;
  onClearCellNote?: (beatIndex: number) => void;
  // Current beat note (for persistent banner display)
  currentBeatNote?: string | null;
  // Formation mode
  formationData?: FormationData | null;
  onEditFormation?: (beatIndex: number) => void;
}

const noop = (_cellIndex: number) => {};  // stable ref for placeholder

const COLS = 8;
const DEFAULT_ROWS = 8;
const MIN_CELL_SIZE = 20;
const SCROLL_ANCHOR_ROW = 2; // auto-scroll keeps current beat at 3rd visible row (0-indexed)
const RENDER_BUFFER_ROWS = 4; // extra rows rendered above/below visible area

export function PhraseGrid({
  countInfo, phraseMap, hasAnalysis, beats, isPlaying,
  onTapBeat, onStartPhraseHere, onSetLoopPoint, onClearLoop,
  onSeekAndPlay, onSeekOnly, onMergeWithPrevious,
  loopStart, loopEnd, rows, scrollMode,
  cellNotes, onSetCellNote, onClearCellNote,
  currentBeatNote,
  formationData, onEditFormation,
}: PhraseGridProps) {
  const rowCount = rows ?? DEFAULT_ROWS;
  const CELLS_PER_PAGE = COLS * rowCount; // used only for placeholder
  const [containerWidth, setContainerWidth] = useState(0);
  const [flashCellIndex, setFlashCellIndex] = useState<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuCellIndex, setMenuCellIndex] = useState<number>(-1);

  // Repeat selection mode ("selecting B")
  const [repeatSelectMode, setRepeatSelectMode] = useState(false);

  // Cell note input modal state
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteModalBeatIndex, setNoteModalBeatIndex] = useState<number>(-1);
  const [noteModalText, setNoteModalText] = useState('');

  // Tooltip state (show note on tap)
  const [tooltipText, setTooltipText] = useState<string | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ScrollView refs for auto-scroll
  const scrollViewRef = useRef<ScrollView>(null);
  const userScrollingRef = useRef(false);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Virtual windowed rendering — only render visible rows + buffer
  const [renderStartRow, setRenderStartRow] = useState(0);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
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

  // ─── Absolute beat indexing (no pagination) ───
  const globalBeatIndex = countInfo?.beatIndex ?? -1;
  const totalBeats = beats.length;
  const totalCells = totalBeats > 0 ? Math.ceil(totalBeats / COLS) * COLS : CELLS_PER_PAGE;
  const totalDataRows = Math.ceil(totalBeats / COLS);

  // Cell size (width-based, uniform spacing)
  const cellSize = useMemo(() => {
    if (containerWidth <= 0) return 0;
    const margins = COLS * CELL_GAP;
    const available = containerWidth - margins;
    return Math.max(Math.floor(available / COLS), MIN_CELL_SIZE);
  }, [containerWidth]);

  const rowHeight = cellSize + CELL_GAP;
  const visibleHeight = rowCount * rowHeight;

  // ─── Auto-scroll during playback ───
  useEffect(() => {
    if (globalBeatIndex < 0 || rowHeight <= 0) return;

    const currentRow = Math.floor(globalBeatIndex / COLS);
    // Always update render window to track current beat
    const targetStartRow = Math.max(0, currentRow - SCROLL_ANCHOR_ROW - RENDER_BUFFER_ROWS);
    setRenderStartRow(prev => prev !== targetStartRow ? targetStartRow : prev);

    // Only auto-scroll the ScrollView when playing and user isn't manually scrolling
    if (!isPlaying || !scrollViewRef.current || userScrollingRef.current) return;
    const targetOffset = Math.max(0, (currentRow - SCROLL_ANCHOR_ROW) * rowHeight);
    scrollViewRef.current.scrollTo({ y: targetOffset, animated: true });
  }, [globalBeatIndex, isPlaying, rowHeight]);

  // Re-enable auto-scroll when playback starts
  useEffect(() => {
    if (isPlaying) {
      userScrollingRef.current = false;
      if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    }
  }, [isPlaying]);

  // Track scroll position for virtual windowed rendering
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (rowHeight <= 0) return;
    const offset = e.nativeEvent.contentOffset.y;
    const newStartRow = Math.max(0, Math.floor(offset / rowHeight) - RENDER_BUFFER_ROWS);
    setRenderStartRow(prev => prev !== newStartRow ? newStartRow : prev);
  }, [rowHeight]);

  const handleScrollBeginDrag = useCallback(() => {
    userScrollingRef.current = true;
    if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    autoScrollTimerRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 3000);
  }, []);

  // ─── Virtual render window ───
  const renderEndRow = Math.min(totalDataRows, renderStartRow + rowCount + RENDER_BUFFER_ROWS * 2);
  const renderStartCell = renderStartRow * COLS;
  const renderEndCell = Math.min(totalCells, renderEndRow * COLS);
  const topSpacerHeight = renderStartRow * rowHeight;
  const bottomSpacerHeight = Math.max(0, (totalDataRows - renderEndRow) * rowHeight);

  // ─── Cell state (absolute indexing) ───
  const getCellState = useCallback((i: number): CellState => {
    if (i >= totalBeats) return 'hidden';
    if (globalBeatIndex < 0) return 'upcoming';
    if (i === globalBeatIndex) return 'current';
    if (i < globalBeatIndex) return 'played';
    return 'upcoming';
  }, [globalBeatIndex, totalBeats]);

  // ─── Cell-to-global-beat (identity for absolute indexing) ───
  const cellToGlobalBeat = useCallback((cellIndex: number): number => {
    return cellIndex < totalBeats ? cellIndex : -1;
  }, [totalBeats]);

  // ─── Per-cell phrase color ───
  const getCellPhraseColor = useCallback((cellIndex: number): string => {
    if (!phraseMap || cellIndex >= totalBeats) return Colors.textMuted;
    for (let p = 0; p < phraseMap.phrases.length; p++) {
      const phrase = phraseMap.phrases[p];
      if (cellIndex >= phrase.startBeatIndex && cellIndex < phrase.endBeatIndex) {
        return getPhraseColor(p);
      }
    }
    return Colors.textMuted;
  }, [phraseMap, totalBeats]);

  // Per-cell row label: first column shows eight-count row number (1,2,3,4) — resets at phrase boundary
  const getCellRowLabel = useCallback((cellIndex: number): string | null => {
    if (cellIndex % COLS !== 0) return null; // only first column
    if (cellIndex >= totalBeats) return null;
    if (!phraseMap) return null;
    for (const phrase of phraseMap.phrases) {
      if (cellIndex >= phrase.startBeatIndex && cellIndex < phrase.endBeatIndex) {
        const beatInPhrase = cellIndex - phrase.startBeatIndex;
        return String(Math.floor(beatInPhrase / COLS) + 1);
      }
    }
    return null;
  }, [totalBeats, phraseMap]);

  // ─── Cell note helpers ───
  const getCellHasNote = useCallback((cellIndex: number): boolean => {
    if (!cellNotes) return false;
    if (cellIndex >= totalBeats) return false;
    return !!cellNotes[String(cellIndex)];
  }, [cellNotes, totalBeats]);

  // ─── Formation keyframe helpers ───
  const getCellHasFormation = useCallback((cellIndex: number): boolean => {
    if (!formationData || cellIndex >= totalBeats) return false;
    return hasKeyframeAtBeat(formationData, cellIndex);
  }, [formationData, totalBeats]);

  const showTooltip = useCallback((globalBeat: number) => {
    if (!cellNotes) return;
    const note = cellNotes[String(globalBeat)];
    if (!note) return;
    setTooltipText(note);
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = setTimeout(() => setTooltipText(null), 3500);
  }, [cellNotes]);

  // ─── Tap handler ───
  const handleCellTap = useCallback((cellIndex: number) => {
    const globalBeat = cellToGlobalBeat(cellIndex);
    if (globalBeat < 0) return;

    // Flash effect
    setFlashCellIndex(cellIndex);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashCellIndex(null), 300);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Show tooltip if cell has a note
    showTooltip(globalBeat);

    if (globalBeat < beats.length) {
      if (isPlaying) {
        // Playing → seek and continue playing from this beat
        onSeekAndPlay(beats[globalBeat] * 1000);
      } else {
        // Paused → just move position to this beat (no auto-play)
        onSeekOnly(beats[globalBeat] * 1000);
      }
    } else {
      onTapBeat(globalBeat);
    }
  }, [cellToGlobalBeat, isPlaying, beats, onSeekAndPlay, onSeekOnly, onTapBeat, showTooltip]);

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

  // ─── Cell note menu handlers ───
  const menuHasNote = useMemo(() => {
    if (menuGlobalBeat < 0 || !cellNotes) return false;
    return !!cellNotes[String(menuGlobalBeat)];
  }, [menuGlobalBeat, cellNotes]);

  const handleAddEditNote = useCallback(() => {
    if (menuGlobalBeat < 0) return;
    const existing = cellNotes?.[String(menuGlobalBeat)] ?? '';
    setNoteModalBeatIndex(menuGlobalBeat);
    setNoteModalText(existing);
    setMenuVisible(false);
    // Small delay so menu closes first
    setTimeout(() => setNoteModalVisible(true), 200);
  }, [menuGlobalBeat, cellNotes]);

  const handleSaveNote = useCallback(() => {
    if (noteModalBeatIndex < 0) return;
    const trimmed = noteModalText.trim().slice(0, 30);
    if (trimmed && onSetCellNote) {
      onSetCellNote(noteModalBeatIndex, trimmed);
    } else if (!trimmed && onClearCellNote) {
      onClearCellNote(noteModalBeatIndex);
    }
    setNoteModalVisible(false);
    Keyboard.dismiss();
  }, [noteModalBeatIndex, noteModalText, onSetCellNote, onClearCellNote]);

  const handleDeleteNote = useCallback(() => {
    if (menuGlobalBeat < 0 || !onClearCellNote) return;
    onClearCellNote(menuGlobalBeat);
    setMenuVisible(false);
  }, [menuGlobalBeat, onClearCellNote]);

  const handleEditFormation = useCallback(() => {
    if (menuGlobalBeat < 0 || !onEditFormation) return;
    onEditFormation(menuGlobalBeat);
    setMenuVisible(false);
  }, [menuGlobalBeat, onEditFormation]);

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
    if (cellIndex >= totalBeats) return null;

    const beatTimeMs = beats[cellIndex] * 1000;
    // Check within +-20ms tolerance for floating point
    if (loopStart != null && Math.abs(beatTimeMs - loopStart) < 20) return 'A';
    if (loopEnd != null && Math.abs(beatTimeMs - loopEnd) < 20) return 'B';
    return null;
  }, [beats, totalBeats, loopStart, loopEnd]);

  // Current phrase info for indicator
  const currentPhraseInfo = useMemo(() => {
    if (!phraseMap || globalBeatIndex < 0) return null;
    for (let p = 0; p < phraseMap.phrases.length; p++) {
      const phrase = phraseMap.phrases[p];
      if (globalBeatIndex >= phrase.startBeatIndex && globalBeatIndex < phrase.endBeatIndex) {
        return { index: p, total: phraseMap.phrases.length };
      }
    }
    return null;
  }, [phraseMap, globalBeatIndex]);

  // ─── No analysis placeholder ───
  if (!hasAnalysis) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholderGrid} onLayout={onLayout}>
          {containerWidth > 0 && Array.from({ length: CELLS_PER_PAGE }, (_, i) => (
                <PhraseGridCell
                  key={i}
                  cellIndex={i}
                  state="upcoming"
                  color={Colors.surfaceLight}
                  size={cellSize}
                  isFlashing={false}
                  onPress={noop}
                  onLongPress={noop}
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

      {/* Phrase indicator */}
      {currentPhraseInfo && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            Phrase {currentPhraseInfo.index + 1} / {currentPhraseInfo.total}
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={visibleHeight > 0 ? { maxHeight: visibleHeight } : undefined}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={100}
        nestedScrollEnabled={true}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={totalDataRows > rowCount}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top spacer for virtual scroll */}
        {topSpacerHeight > 0 && <View style={{ height: topSpacerHeight }} />}
        <View
          onLayout={onLayout}
          style={styles.grid}
        >
          {containerWidth > 0 && cellSize > 0 && Array.from({ length: renderEndCell - renderStartCell }, (_, idx) => {
                const i = renderStartCell + idx;
                return (
                  <PhraseGridCell
                    key={i}
                    cellIndex={i}
                    state={getCellState(i)}
                    color={getCellPhraseColor(i)}
                    size={cellSize}
                    isFlashing={flashCellIndex === i}
                    onPress={handleCellTap}
                    onLongPress={handleCellLongPress}
                    repeatMarker={getRepeatMarker(i)}
                    rowLabel={getCellRowLabel(i)}
                    hasNote={getCellHasNote(i)}
                    hasFormation={getCellHasFormation(i)}
                  />
                );
          })}
        </View>
        {/* Bottom spacer for virtual scroll */}
        {bottomSpacerHeight > 0 && <View style={{ height: bottomSpacerHeight }} />}
      </ScrollView>

      {/* Context menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Beat {menuGlobalBeat + 1}</Text>
            {/* Show existing note content in context menu */}
            {menuHasNote && cellNotes && menuGlobalBeat >= 0 && (
              <View style={styles.menuNotePreview}>
                <Text style={styles.menuNotePreviewText}>
                  📝 {cellNotes[String(menuGlobalBeat)]}
                </Text>
              </View>
            )}

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

            {/* Edit formation */}
            {onEditFormation && (
              <TouchableOpacity style={styles.menuOption} onPress={handleEditFormation}>
                <Text style={styles.menuOptionText}>Edit formation</Text>
              </TouchableOpacity>
            )}

            {/* Separator */}
            {(onSetCellNote || onEditFormation) && <View style={styles.menuSeparator} />}

            {/* Add/Edit note */}
            {onSetCellNote && (
              <TouchableOpacity style={styles.menuOption} onPress={handleAddEditNote}>
                <Text style={styles.menuOptionText}>
                  {menuHasNote ? '✏️ Edit memo' : '📝 Add memo'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Delete note — only when note exists */}
            {menuHasNote && onClearCellNote && (
              <TouchableOpacity
                style={[styles.menuOption, styles.menuOptionDanger]}
                onPress={handleDeleteNote}
              >
                <Text style={[styles.menuOptionText, styles.menuOptionDangerText]}>
                  Delete memo
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Tooltip for cell notes (tap) */}
      {tooltipText && (
        <View style={styles.tooltipContainer}>
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>📝 {tooltipText}</Text>
          </View>
        </View>
      )}

      {/* Persistent current beat note banner */}
      {!tooltipText && currentBeatNote && (
        <View style={styles.noteBanner}>
          <Text style={styles.noteBannerText} numberOfLines={1}>
            📝 {currentBeatNote}
          </Text>
        </View>
      )}

      {/* Note input modal */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setNoteModalVisible(false); Keyboard.dismiss(); }}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => { setNoteModalVisible(false); Keyboard.dismiss(); }}
        >
          <Pressable style={styles.noteModalContainer} onPress={() => {}}>
            <Text style={styles.noteModalTitle}>
              Beat {noteModalBeatIndex + 1} memo
            </Text>
            <TextInput
              style={styles.noteInput}
              value={noteModalText}
              onChangeText={(t) => setNoteModalText(t.slice(0, 30))}
              maxLength={30}
              placeholder="Enter memo (max 30 chars)"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveNote}
            />
            <Text style={styles.noteCharCount}>
              {noteModalText.length}/30
            </Text>
            <View style={styles.noteModalButtons}>
              <TouchableOpacity
                style={styles.noteModalCancel}
                onPress={() => { setNoteModalVisible(false); Keyboard.dismiss(); }}
              >
                <Text style={styles.noteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.noteModalSave}
                onPress={handleSaveNote}
              >
                <Text style={styles.noteModalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
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
  // Menu separator
  menuSeparator: {
    height: 1,
    backgroundColor: Colors.surfaceLight,
    marginVertical: Spacing.xs,
  },
  // Tooltip (tap to view)
  tooltipContainer: {
    alignItems: 'center',
    marginTop: 6,
    zIndex: 10,
  },
  tooltip: {
    backgroundColor: 'rgba(45, 212, 191, 0.95)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '90%',
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Persistent current beat note banner
  noteBanner: {
    alignItems: 'center',
    marginTop: 6,
  },
  noteBannerText: {
    color: '#2DD4BF',
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Menu note preview
  menuNotePreview: {
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: Spacing.sm,
  },
  menuNotePreviewText: {
    color: '#2DD4BF',
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Note input modal
  noteModalContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    minWidth: 280,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  noteModalTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  noteInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: 4,
  },
  noteCharCount: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'right',
    marginBottom: Spacing.md,
  },
  noteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  noteModalCancel: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
  },
  noteModalCancelText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  noteModalSave: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: '#2DD4BF',
    alignItems: 'center',
  },
  noteModalSaveText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
