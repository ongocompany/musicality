import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Modal, Pressable, TouchableOpacity, TextInput, Keyboard, ScrollView, NativeSyntheticEvent, NativeScrollEvent, Platform } from 'react-native';
import { useTutorialStore } from '../../stores/tutorialStore';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, getPhraseColor, NoteTypeColors } from '../../constants/theme';
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
  onSplitPhraseHere: (globalBeatIndex: number) => void;
  onReArrangePhrase: (globalBeatIndex: number) => void;
  onSetLoopPoint: (beatTimeMs: number) => void;
  onClearLoop: () => void;
  onSeekAndPlay: (beatTimeMs: number) => void;
  onSeekOnly: (beatTimeMs: number) => void;  // seek without playing (paused tap)
  onMergeWithPrevious: (globalBeatIndex: number) => void;
  loopStart: number | null;
  loopEnd: number | null;
  rows?: number; // visible rows (default 8)
  scrollMode?: boolean; // false = fixed page mode, true = scroll mode
  // Cell notes (per-beat memos)
  cellNotes?: Record<string, string>;  // beatIndex(string) → note
  onSetCellNote?: (beatIndex: number, note: string) => void;
  onClearCellNote?: (beatIndex: number) => void;
  // Current beat note (for persistent banner display)
  currentBeatNote?: string | null;
  // Formation mode
  formationData?: FormationData | null;
  onEditFormation?: (beatIndex: number) => void;
  onCopyPrevKeyframe?: (beatIndex: number) => void;
  onNewFormation?: (beatIndex: number, halfWidth: number) => void;
  // Edit mode — changes cell tap behavior
  editMode?: 'none' | 'note' | 'formation';
}

const noop = (_cellIndex: number) => {};  // stable ref for placeholder

const COLS = 8;
const DEFAULT_ROWS = 8;
const ROW_LABEL_WIDTH = 18;
const MIN_CELL_SIZE = 20;
const SCROLL_ANCHOR_ROW = 2; // auto-scroll keeps current beat at 3rd visible row (0-indexed)
const RENDER_BUFFER_ROWS = 4; // extra rows rendered above/below visible area

export function PhraseGrid({
  countInfo, phraseMap, hasAnalysis, beats, isPlaying,
  onTapBeat, onSplitPhraseHere, onReArrangePhrase, onSetLoopPoint, onClearLoop,
  onSeekAndPlay, onSeekOnly, onMergeWithPrevious,
  loopStart, loopEnd, rows, scrollMode,
  cellNotes, onSetCellNote, onClearCellNote,
  currentBeatNote,
  formationData, onEditFormation, onCopyPrevKeyframe, onNewFormation,
  editMode = 'none',
}: PhraseGridProps) {
  const { t } = useTranslation();
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
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
  const gridContainerRef = useRef<View>(null);
  const userScrollingRef = useRef(false);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Virtual windowed rendering — only render visible rows + buffer
  const [renderStartRow, setRenderStartRow] = useState(0);

  // Track the beat where the last phrase action was performed (for scroll anchor)
  const actionBeatRef = useRef<number>(-1);

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

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height);
  }, []);

  // ─── Phrase-aware beat layout ───
  const globalBeatIndex = countInfo?.beatIndex ?? -1;
  const totalBeats = beats.length;

  // Each phrase starts on a new row (col 0), with padding cells at end of partial rows
  const { visualCells, beatToVisualCell } = useMemo(() => {
    const cells: number[] = [];
    const b2vc = new Map<number, number>();

    if (phraseMap && phraseMap.phrases.length > 0) {
      for (const phrase of phraseMap.phrases) {
        const count = Math.min(phrase.endBeatIndex, beats.length) - phrase.startBeatIndex;
        for (let i = 0; i < count; i++) {
          const beatIdx = phrase.startBeatIndex + i;
          b2vc.set(beatIdx, cells.length);
          cells.push(beatIdx);
        }
        // Pad to fill the row so next phrase starts at col 0
        const remainder = count % COLS;
        if (remainder > 0) {
          for (let pad = 0; pad < COLS - remainder; pad++) {
            cells.push(-1);
          }
        }
      }
    } else {
      // Fallback: simple sequential layout
      for (let i = 0; i < beats.length; i++) {
        b2vc.set(i, i);
        cells.push(i);
      }
    }

    return { visualCells: cells, beatToVisualCell: b2vc };
  }, [beats.length, phraseMap]);

  // Cell size (width-based, uniform spacing)
  const cellSize = useMemo(() => {
    if (containerWidth <= 0) return 0;
    const margins = COLS * CELL_GAP;
    const available = containerWidth - ROW_LABEL_WIDTH - 22 - margins;
    return Math.max(Math.floor(available / COLS), MIN_CELL_SIZE);
  }, [containerWidth]);

  const rowHeight = cellSize + CELL_GAP;

  const rowCount = useMemo(() => {
    if (rows !== undefined) return rows;
    if (containerHeight > 0 && rowHeight > 0) {
      return Math.max(1, Math.floor(containerHeight / rowHeight));
    }
    return DEFAULT_ROWS;
  }, [rows, containerHeight, rowHeight]);

  const CELLS_PER_PAGE = COLS * rowCount;
  const visibleHeight = rowHeight > 0 ? rowCount * rowHeight : undefined;

  const totalVisualCells = visualCells.length > 0 ? visualCells.length : CELLS_PER_PAGE;
  const totalDataRows = Math.ceil(totalVisualCells / COLS);

  // ─── Reset render window when phrase layout changes (e.g. split/re-arrange) ───
  const prevVisualCellsRef = useRef(visualCells);
  useEffect(() => {
    if (prevVisualCellsRef.current === visualCells) return;
    prevVisualCellsRef.current = visualCells;

    // Re-anchor to the action beat (where user split/re-arranged)
    if (actionBeatRef.current >= 0) {
      const anchorBeat = actionBeatRef.current;
      actionBeatRef.current = -1; // consume
      const visualCell = beatToVisualCell.get(anchorBeat);
      if (visualCell != null) {
        const currentRow = Math.floor(visualCell / COLS);
        const targetStartRow = Math.max(0, currentRow - SCROLL_ANCHOR_ROW - RENDER_BUFFER_ROWS);
        setRenderStartRow(targetStartRow);
        if (scrollViewRef.current && rowHeight > 0) {
          const targetOffset = Math.max(0, (currentRow - SCROLL_ANCHOR_ROW) * rowHeight);
          scrollViewRef.current.scrollTo({ y: targetOffset, animated: false });
        }
        return;
      }
    }
    // No action beat — only reposition if playing (don't jump while editing)
    if (isPlaying && globalBeatIndex >= 0) {
      const visualCell = beatToVisualCell.get(globalBeatIndex);
      if (visualCell != null) {
        const currentRow = Math.floor(visualCell / COLS);
        const targetStartRow = Math.max(0, currentRow - SCROLL_ANCHOR_ROW - RENDER_BUFFER_ROWS);
        setRenderStartRow(targetStartRow);
        return;
      }
    }
    // Fallback: clamp render window
    const maxStartRow = Math.max(0, totalDataRows - rowCount);
    setRenderStartRow(prev => Math.min(prev, maxStartRow));
  }, [visualCells, totalDataRows, rowCount, globalBeatIndex, beatToVisualCell, rowHeight]);

  // ─── Auto-scroll during playback only ───
  useEffect(() => {
    if (!isPlaying) return; // paused: no auto-scroll (user is editing)
    if (globalBeatIndex < 0 || rowHeight <= 0) return;

    const visualCell = beatToVisualCell.get(globalBeatIndex);
    if (visualCell == null) return;
    const currentRow = Math.floor(visualCell / COLS);
    // Always update render window to track current beat
    const targetStartRow = Math.max(0, currentRow - SCROLL_ANCHOR_ROW - RENDER_BUFFER_ROWS);
    setRenderStartRow(prev => prev !== targetStartRow ? targetStartRow : prev);

    // Auto-scroll the ScrollView when user isn't manually scrolling
    if (!scrollViewRef.current || userScrollingRef.current) return;
    const targetOffset = Math.max(0, (currentRow - SCROLL_ANCHOR_ROW) * rowHeight);
    scrollViewRef.current.scrollTo({ y: targetOffset, animated: isPlaying });
  }, [globalBeatIndex, isPlaying, rowHeight, beatToVisualCell, editMode]);

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

  // ─── Page mode: fixed page that auto-advances with current beat ───
  const currentPage = useMemo(() => {
    if (scrollMode || globalBeatIndex < 0) return 0;
    const visualCell = beatToVisualCell.get(globalBeatIndex);
    if (visualCell == null) return 0;
    const currentRow = Math.floor(visualCell / COLS);
    return Math.floor(currentRow / rowCount);
  }, [scrollMode, globalBeatIndex, beatToVisualCell, rowCount]);

  const totalPages = Math.ceil(totalDataRows / rowCount);

  // ─── Virtual render window (scroll mode) / Page window (page mode) ───
  const renderEndRow = scrollMode
    ? Math.min(totalDataRows, renderStartRow + rowCount + RENDER_BUFFER_ROWS * 2)
    : Math.min(totalDataRows, (currentPage + 1) * rowCount);
  const renderStartCell = scrollMode
    ? renderStartRow * COLS
    : currentPage * rowCount * COLS;
  const renderEndCell = Math.min(totalVisualCells, renderEndRow * COLS);
  const topSpacerHeight = scrollMode ? renderStartRow * rowHeight : 0;
  const bottomSpacerHeight = scrollMode ? Math.max(0, (totalDataRows - renderEndRow) * rowHeight) : 0;

  // ─── Cell state (phrase-aware) ───
  const getCellState = useCallback((i: number): CellState => {
    const globalBeat = i < visualCells.length ? visualCells[i] : -1;
    if (globalBeat < 0) return 'hidden';
    if (globalBeatIndex < 0) return 'upcoming';
    if (globalBeat === globalBeatIndex) return 'current';
    if (globalBeat < globalBeatIndex) return 'played';
    return 'upcoming';
  }, [globalBeatIndex, visualCells]);

  // ─── Cell-to-global-beat (phrase-aware layout) ───
  const cellToGlobalBeat = useCallback((cellIndex: number): number => {
    if (cellIndex < 0 || cellIndex >= visualCells.length) return -1;
    return visualCells[cellIndex];
  }, [visualCells]);

  // ─── Per-cell phrase color ───
  const getCellPhraseColor = useCallback((cellIndex: number): string => {
    const globalBeat = cellIndex < visualCells.length ? visualCells[cellIndex] : -1;
    if (!phraseMap || globalBeat < 0) return Colors.textMuted;
    for (let p = 0; p < phraseMap.phrases.length; p++) {
      const phrase = phraseMap.phrases[p];
      if (globalBeat >= phrase.startBeatIndex && globalBeat < phrase.endBeatIndex) {
        return getPhraseColor(p);
      }
    }
    return Colors.textMuted;
  }, [phraseMap, visualCells]);

  // Per-cell row label: first column shows song-wide sequential row number
  const getCellRowLabel = useCallback((cellIndex: number): string | null => {
    if (cellIndex % COLS !== 0) return null; // only first column
    const globalBeat = cellIndex < visualCells.length ? visualCells[cellIndex] : -1;
    if (globalBeat < 0) return null;
    return String(Math.floor(cellIndex / COLS) + 1);
  }, [visualCells]);

  // Per-cell phrase label: first column shows row number within phrase (1, 2, 3, 4...)
  const getCellPhraseLabel = useCallback((cellIndex: number): string | null => {
    if (cellIndex % COLS !== 0) return null; // only first column
    const globalBeat = cellIndex < visualCells.length ? visualCells[cellIndex] : -1;
    if (!phraseMap || globalBeat < 0) return null;
    for (let p = 0; p < phraseMap.phrases.length; p++) {
      const phrase = phraseMap.phrases[p];
      if (globalBeat >= phrase.startBeatIndex && globalBeat < phrase.endBeatIndex) {
        const rowWithinPhrase = Math.floor((globalBeat - phrase.startBeatIndex) / COLS) + 1;
        return String(rowWithinPhrase);
      }
    }
    return null;
  }, [phraseMap, visualCells]);

  // Beat count inside each cell (1-8 within the row)
  const getCellBeatCount = useCallback((cellIndex: number): number | undefined => {
    const globalBeat = cellIndex < visualCells.length ? visualCells[cellIndex] : -1;
    if (globalBeat < 0) return undefined;
    return (cellIndex % COLS) + 1;
  }, [visualCells]);

  // ─── Cell note helpers ───
  const getCellHasNote = useCallback((cellIndex: number): boolean => {
    if (!cellNotes) return false;
    const globalBeat = cellIndex < visualCells.length ? visualCells[cellIndex] : -1;
    if (globalBeat < 0) return false;
    return !!cellNotes[String(globalBeat)];
  }, [cellNotes, visualCells]);

  // ─── Formation keyframe helpers ───
  const getCellHasFormation = useCallback((cellIndex: number): boolean => {
    if (!formationData) return false;
    const globalBeat = cellIndex < visualCells.length ? visualCells[cellIndex] : -1;
    if (globalBeat < 0 || globalBeat >= totalBeats) return false;
    return hasKeyframeAtBeat(formationData, globalBeat);
  }, [formationData, totalBeats, visualCells]);

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

    // Edit mode: formation → open editor instead of seeking
    if (editMode === 'formation' && onEditFormation) {
      onEditFormation(globalBeat);
      return;
    }

    // Edit mode: note → tap seeks to beat (popup via long-press only)

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
  }, [cellToGlobalBeat, isPlaying, beats, onSeekAndPlay, onSeekOnly, onTapBeat, showTooltip, editMode, onEditFormation, onSetCellNote]);

  // ─── Long-press handler (disabled during playback) ───
  const handleCellLongPress = useCallback((cellIndex: number) => {
    if (isPlaying) return; // no editing during playback
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
  }, [cellToGlobalBeat, repeatSelectMode, beats, onSetLoopPoint, isPlaying]);

  // ─── Context menu helpers ───
  const menuGlobalBeat = useMemo(() => {
    if (menuCellIndex < 0) return -1;
    return cellToGlobalBeat(menuCellIndex);
  }, [menuCellIndex, cellToGlobalBeat]);

  const handleSplitPhraseHere = useCallback(() => {
    if (menuGlobalBeat < 0) return;
    console.log(`[Grid] split at beat=${menuGlobalBeat}, cellIdx=${menuCellIndex}`);
    actionBeatRef.current = menuGlobalBeat;
    onSplitPhraseHere(menuGlobalBeat);
    setMenuVisible(false);
    setMenuCellIndex(-1);
  }, [menuGlobalBeat, menuCellIndex, onSplitPhraseHere]);

  const handleReArrangePhrase = useCallback(() => {
    if (menuGlobalBeat < 0) return;
    console.log(`[Grid] rearrange at beat=${menuGlobalBeat}, cellIdx=${menuCellIndex}`);
    actionBeatRef.current = menuGlobalBeat;
    onReArrangePhrase(menuGlobalBeat);
    setMenuVisible(false);
    setMenuCellIndex(-1);
  }, [menuGlobalBeat, menuCellIndex, onReArrangePhrase]);

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
    console.log(`[Grid] merge at beat=${menuGlobalBeat}, cellIdx=${menuCellIndex}`);
    actionBeatRef.current = menuGlobalBeat;
    onMergeWithPrevious(menuGlobalBeat);
    setMenuVisible(false);
    setMenuCellIndex(-1);
  }, [menuGlobalBeat, menuCellIndex, onMergeWithPrevious]);

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
    const globalBeat = cellIndex < visualCells.length ? visualCells[cellIndex] : -1;
    if (globalBeat < 0) return null;

    const beatTimeMs = beats[globalBeat] * 1000;
    // Check within +-20ms tolerance for floating point
    if (loopStart != null && Math.abs(beatTimeMs - loopStart) < 20) return 'A';
    if (loopEnd != null && Math.abs(beatTimeMs - loopEnd) < 20) return 'B';
    return null;
  }, [beats, visualCells, loopStart, loopEnd]);

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
            <Text style={styles.placeholderText}>{t('player.analyzeToSee')}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      ref={gridContainerRef}
      style={[styles.container, { flex: 1 }]}
      onLayout={(e) => {
        onContainerLayout(e);
        // Measure absolute position for tutorial spotlight
        gridContainerRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) {
            useTutorialStore.getState().setElementRect('phraseGrid', { x, y, width: w, height: h });
          }
        });
      }}
    >
      {/* "Selecting B" hint */}
      {repeatSelectMode && (
        <View style={styles.repeatHint}>
          <Text style={styles.repeatHintText}>
            {t('player.loopSet')}
          </Text>
        </View>
      )}

      {/* Phrase / Page indicator — hidden to save vertical space */}
      {false && currentPhraseInfo && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            {scrollMode
              ? `Phrase ${currentPhraseInfo.index + 1} / ${currentPhraseInfo.total}`
              : `Page ${currentPage + 1} / ${totalPages}  ·  Phrase ${currentPhraseInfo.index + 1} / ${currentPhraseInfo.total}`
            }
          </Text>
        </View>
      )}

      {/* Grid cells — shared between scroll and page modes */}
      {(() => {
        const renderStartRowIdx = Math.floor(renderStartCell / COLS);
        const renderEndRowIdx = Math.ceil(renderEndCell / COLS);
        const gridContent = (
          <View onLayout={onLayout} style={{ flexDirection: 'row' }}>
            {/* Row labels column */}
            {containerWidth > 0 && cellSize > 0 && (
              <View style={{ width: ROW_LABEL_WIDTH, paddingTop: CELL_GAP / 2 }}>
                {Array.from({ length: renderEndRowIdx - renderStartRowIdx }, (_, ri) => {
                  const row = renderStartRowIdx + ri;
                  return (
                    <View key={`rl-${row}`} style={{ height: cellSize + CELL_GAP, justifyContent: 'center' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: Math.max(7, Math.round(cellSize * 0.22)), fontWeight: '600', textAlign: 'right', paddingRight: 3 }}>
                        {row + 1}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {/* Grid cells */}
            <View style={[styles.grid, { flex: 1 }]}>
              {containerWidth > 0 && cellSize > 0 && Array.from({ length: renderEndCell - renderStartCell }, (_, idx) => {
                    const i = renderStartCell + idx;
                    const beatForKey = i < visualCells.length ? visualCells[i] : -1;
                    return (
                      <PhraseGridCell
                        key={`${beatForKey}:${i}`}
                        cellIndex={i}
                        state={getCellState(i)}
                        color={getCellPhraseColor(i)}
                        size={cellSize}
                        isFlashing={flashCellIndex === i}
                        onPress={handleCellTap}
                        onLongPress={handleCellLongPress}
                        repeatMarker={getRepeatMarker(i)}
                        rowLabel={null}
                        hasNote={getCellHasNote(i)}
                        hasFormation={getCellHasFormation(i)}
                        beatCount={getCellBeatCount(i)}
                        phraseLabel={getCellPhraseLabel(i)}
                      />
                    );
              })}
            </View>
          </View>
        );

        if (scrollMode) {
          return (
            <ScrollView
              ref={scrollViewRef}
              style={visibleHeight != null && visibleHeight > 0 ? { maxHeight: visibleHeight } : { flex: 1 }}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              scrollEventThrottle={Platform.OS === 'android' ? 250 : 100}
              nestedScrollEnabled={true}
              bounces={false}
              overScrollMode="never"
              scrollEnabled={totalDataRows > rowCount}
              keyboardShouldPersistTaps="handled"
            >
              {topSpacerHeight > 0 && <View style={{ height: topSpacerHeight }} />}
              {gridContent}
              {bottomSpacerHeight > 0 && <View style={{ height: bottomSpacerHeight }} />}
            </ScrollView>
          );
        }

        // Page mode: fixed view, no scroll
        return (
          <View style={visibleHeight != null && visibleHeight > 0 ? { height: visibleHeight, overflow: 'hidden' } : { flex: 1, overflow: 'hidden' }}>
            {gridContent}
          </View>
        );
      })()}

      {/* Context menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuContainer, editMode === 'formation' ? { borderColor: NoteTypeColors.choreoNote, borderWidth: 1.5 } : editMode === 'note' ? { borderColor: NoteTypeColors.phraseNote, borderWidth: 1.5 } : {}]}>
            <Text style={[styles.menuTitle, { color: menuCellIndex >= 0 ? getCellPhraseColor(menuCellIndex) : Colors.textMuted }]}>Beat {menuGlobalBeat + 1}</Text>
            {/* Show existing note content in context menu (non-formation only) */}
            {editMode !== 'formation' && menuHasNote && cellNotes && menuGlobalBeat >= 0 && (
              <View style={styles.menuNotePreview}>
                <Text style={styles.menuNotePreviewText}>
                  {cellNotes[String(menuGlobalBeat)]}
                </Text>
              </View>
            )}

            {/* Formation mode: keyframe tools */}
            {editMode === 'formation' && onCopyPrevKeyframe && (
              <TouchableOpacity style={[styles.menuOption, { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8 }]} onPress={() => {
                onCopyPrevKeyframe(menuGlobalBeat);
                setMenuVisible(false);
              }}>
                <Text style={styles.menuOptionText}>키프레임 복사</Text>
              </TouchableOpacity>
            )}
            {editMode === 'formation' && onNewFormation && (
              <View>
                <Text style={[styles.menuOptionText, { paddingVertical: 8, color: Colors.textMuted, fontSize: FontSize.sm }]}>
                  {t('player.newFormationStart')}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.menuOption, { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8 }]}
                    onPress={() => {
                      onNewFormation(menuGlobalBeat, 2);
                      setMenuVisible(false);
                    }}
                  >
                    <Text style={styles.menuOptionText}>4 cell</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.menuOption, { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8 }]}
                    onPress={() => {
                      onNewFormation(menuGlobalBeat, 4);
                      setMenuVisible(false);
                    }}
                  >
                    <Text style={styles.menuOptionText}>8 cell</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Non-formation mode: phrase editing options */}
            {editMode !== 'formation' && (
              <>
                {/* Re-arrange phrases — paused + not first cell of phrase */}
                {!isPlaying && !isFirstCellOfPhrase && (
                  <TouchableOpacity style={styles.menuOption} onPress={handleReArrangePhrase}>
                    <Text style={styles.menuOptionText}>{t('player.reArrangePhrase')}</Text>
                  </TouchableOpacity>
                )}

                {/* Split phrase here — paused + not first cell of phrase */}
                {!isPlaying && !isFirstCellOfPhrase && (
                  <TouchableOpacity style={styles.menuOption} onPress={handleSplitPhraseHere}>
                    <Text style={styles.menuOptionText}>{t('player.splitPhrase')}</Text>
                  </TouchableOpacity>
                )}

                {/* Repeat from here — always available */}
                <TouchableOpacity style={styles.menuOption} onPress={handleRepeatFromHere}>
                  <Text style={styles.menuOptionText}>{t('player.loopSet')}</Text>
                </TouchableOpacity>

                {/* Merge with previous — paused + first cell of non-first phrase */}
                {!isPlaying && canMerge && (
                  <TouchableOpacity style={styles.menuOption} onPress={handleMergeWithPrevious}>
                    <Text style={styles.menuOptionText}>{t('player.deletePhrase')}</Text>
                  </TouchableOpacity>
                )}

                {/* Clear repeat — when loop is set */}
                {(loopStart != null || loopEnd != null) && (
                  <TouchableOpacity
                    style={[styles.menuOption, styles.menuOptionDanger]}
                    onPress={handleClearLoop}
                  >
                    <Text style={[styles.menuOptionText, styles.menuOptionDangerText]}>
                      {t('player.loopClear')}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Separator */}
            {onSetCellNote && <View style={styles.menuSeparator} />}

            {/* Add/Edit note */}
            {onSetCellNote && (
              <TouchableOpacity style={styles.menuOption} onPress={handleAddEditNote}>
                <Text style={styles.menuOptionText}>
                  {t('player.memo')}
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
                  {t('player.deletePhrase')}
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
            <Text style={styles.tooltipText}>{tooltipText}</Text>
          </View>
        </View>
      )}

      {/* Persistent current beat note banner */}
      {!tooltipText && currentBeatNote && (
        <View style={styles.noteBanner}>
          <Text style={styles.noteBannerText} numberOfLines={1}>
            {currentBeatNote}
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
              onChangeText={(v) => setNoteModalText(v.slice(0, 30))}
              maxLength={30}
              placeholder={t('player.enterMemo')}
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
                <Text style={styles.noteModalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.noteModalSave}
                onPress={handleSaveNote}
              >
                <Text style={styles.noteModalSaveText}>{t('common.save')}</Text>
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
