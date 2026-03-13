'use client';

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { findCurrentBeatIndex } from '@/utils/beat-counter';
import {
  getPhraseColor,
  findPhraseForBeat,
  type PhraseMap,
  type Phrase,
} from '@/utils/phrase-detector';

// ─── Constants ────────────────────────────────────────

const COLS = 8;
const MAX_VISIBLE_ROWS = 6;  // max rows shown before scrolling
const SCROLL_ANCHOR_ROW = 2; // keep current beat at row 3 (0-indexed)
const RENDER_BUFFER = 4;     // extra rows above/below viewport
const LOOP_TOLERANCE_MS = 20;

type CellState = 'upcoming' | 'current' | 'played' | 'hidden';

// ─── Props ────────────────────────────────────────────

interface PhraseGridProps {
  positionMs: number;
  beats: number[];
  phraseMap: PhraseMap | null;
  isPlaying: boolean;
  onSeekAndPlay: (beatTimeMs: number) => void;
  onSeekOnly: (beatTimeMs: number) => void;
  onStartPhraseHere?: (globalBeatIndex: number) => void;
  onMergeWithPrevious?: (globalBeatIndex: number) => void;
  onSetLoopPoint?: (beatTimeMs: number) => void;
  onClearLoop?: () => void;
  loopStart?: number | null;  // ms
  loopEnd?: number | null;    // ms
  cellNotes?: Record<string, string>;
  onSetCellNote?: (beatIndex: number, note: string) => void;
  onClearCellNote?: (beatIndex: number) => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────

export function PhraseGrid({
  positionMs,
  beats,
  phraseMap,
  isPlaying,
  onSeekAndPlay,
  onSeekOnly,
  onStartPhraseHere,
  onMergeWithPrevious,
  onSetLoopPoint,
  onClearLoop,
  loopStart,
  loopEnd,
  cellNotes,
  onSetCellNote,
  onClearCellNote,
  className,
}: PhraseGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [visibleRows, setVisibleRows] = useState(12);
  const [scrollTop, setScrollTop] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    beatIndex: number;
  } | null>(null);
  const [noteInput, setNoteInput] = useState<{
    beatIndex: number;
    value: string;
  } | null>(null);

  // ─── Current beat index ──────────────────────────────

  const currentBeatIndex = useMemo(
    () => findCurrentBeatIndex(positionMs, beats),
    [positionMs, beats],
  );

  // ─── Total rows ──────────────────────────────────────

  const totalRows = Math.ceil(beats.length / COLS);

  // ─── Measure container ───────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setContainerWidth(w);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ─── Cell size ───────────────────────────────────────

  const gap = 3;
  const MAX_CELL_SIZE = 48;
  const cellSize = containerWidth > 0
    ? Math.min(MAX_CELL_SIZE, Math.max(20, (containerWidth - gap * (COLS + 1)) / COLS))
    : 36;
  const rowHeight = cellSize + gap;

  // ─── Compute visible rows from scroll area ──────────

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    setVisibleRows(Math.ceil(h / rowHeight) + 1);
  }, [rowHeight]);

  // ─── Auto-scroll during playback ────────────────────

  useEffect(() => {
    if (!isPlaying || currentBeatIndex < 0) return;
    const el = scrollRef.current;
    if (!el) return;

    const currentRow = Math.floor(currentBeatIndex / COLS);
    const targetScrollTop = Math.max(0, (currentRow - SCROLL_ANCHOR_ROW) * rowHeight);

    el.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }, [isPlaying, currentBeatIndex, rowHeight]);

  // ─── Track scroll position ──────────────────────────

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  // ─── Virtual window ─────────────────────────────────

  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowHeight) - RENDER_BUFFER);
  const lastVisibleRow = Math.min(
    totalRows - 1,
    Math.floor(scrollTop / rowHeight) + visibleRows + RENDER_BUFFER,
  );

  // ─── Cell click handler ─────────────────────────────

  const handleCellClick = useCallback(
    (globalBeatIndex: number) => {
      if (globalBeatIndex < 0 || globalBeatIndex >= beats.length) return;
      const beatTimeMs = beats[globalBeatIndex] * 1000;

      if (isPlaying) {
        onSeekAndPlay(beatTimeMs);
      } else {
        onSeekOnly(beatTimeMs);
      }
    },
    [beats, isPlaying, onSeekAndPlay, onSeekOnly],
  );

  // ─── Context menu ───────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, globalBeatIndex: number) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, beatIndex: globalBeatIndex });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Close context menu on scroll or click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [contextMenu]);

  // ─── Note input handlers ────────────────────────────

  const handleOpenNoteInput = useCallback(
    (beatIndex: number) => {
      const existing = cellNotes?.[String(beatIndex)] ?? '';
      setNoteInput({ beatIndex, value: existing });
      setContextMenu(null);
    },
    [cellNotes],
  );

  const handleSaveNote = useCallback(() => {
    if (!noteInput) return;
    const trimmed = noteInput.value.trim();
    if (trimmed) {
      onSetCellNote?.(noteInput.beatIndex, trimmed);
    } else {
      onClearCellNote?.(noteInput.beatIndex);
    }
    setNoteInput(null);
  }, [noteInput, onSetCellNote, onClearCellNote]);

  // ─── Phrase info header ─────────────────────────────

  const currentPhrase = useMemo(() => {
    if (!phraseMap || currentBeatIndex < 0) return null;
    return findPhraseForBeat(currentBeatIndex, phraseMap);
  }, [phraseMap, currentBeatIndex]);

  // ─── Render ─────────────────────────────────────────

  if (beats.length === 0) return null;

  const totalHeight = totalRows * rowHeight;

  // Grid content width when cells are at max size
  const gridContentWidth = COLS * cellSize + (COLS + 1) * gap;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Phrase header */}
      <div className="flex items-center justify-between px-1 mb-1.5" style={{ maxWidth: gridContentWidth, margin: '0 auto 6px' }}>
        <span className="text-[11px] font-medium text-muted-foreground">
          {currentPhrase
            ? `Phrase ${currentPhrase.index + 1} / ${phraseMap?.phrases.length ?? 0}`
            : 'Phrase Grid'}
        </span>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <span key={n} className="w-4 text-center opacity-60">{n}</span>
          ))}
        </div>
      </div>

      {/* Scrollable grid area */}
      <div
        ref={scrollRef}
        className="overflow-y-auto overflow-x-hidden mx-auto scrollbar-hide"
        style={{ maxHeight: MAX_VISIBLE_ROWS * rowHeight + 'px', maxWidth: gridContentWidth }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {Array.from(
            { length: lastVisibleRow - firstVisibleRow + 1 },
            (_, i) => firstVisibleRow + i,
          ).map((row) => (
            <GridRow
              key={row}
              row={row}
              beats={beats}
              currentBeatIndex={currentBeatIndex}
              phraseMap={phraseMap}
              cellSize={cellSize}
              gap={gap}
              rowHeight={rowHeight}
              loopStart={loopStart ?? null}
              loopEnd={loopEnd ?? null}
              cellNotes={cellNotes}
              onCellClick={handleCellClick}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            transform: 'translate(-50%, -100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {onStartPhraseHere && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onStartPhraseHere(contextMenu.beatIndex);
                closeContextMenu();
              }}
            >
              Start Phrase Here
            </button>
          )}
          {onMergeWithPrevious && contextMenu.beatIndex > 0 && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                onMergeWithPrevious(contextMenu.beatIndex);
                closeContextMenu();
              }}
            >
              Merge with Previous
            </button>
          )}
          {onSetLoopPoint && (
            <>
              <div className="border-t border-border my-0.5" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={() => {
                  onSetLoopPoint(beats[contextMenu.beatIndex] * 1000);
                  closeContextMenu();
                }}
              >
                Set A/B Loop Point
              </button>
            </>
          )}
          {onClearLoop && loopStart != null && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors text-destructive"
              onClick={() => {
                onClearLoop();
                closeContextMenu();
              }}
            >
              Clear Loop
            </button>
          )}
          <div className="border-t border-border my-0.5" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => handleOpenNoteInput(contextMenu.beatIndex)}
          >
            {cellNotes?.[String(contextMenu.beatIndex)]
              ? 'Edit Note'
              : 'Add Note'}
          </button>
          {cellNotes?.[String(contextMenu.beatIndex)] && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors text-destructive"
              onClick={() => {
                onClearCellNote?.(contextMenu.beatIndex);
                closeContextMenu();
              }}
            >
              Delete Note
            </button>
          )}
        </div>
      )}

      {/* Note input dialog */}
      {noteInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="bg-popover border border-border rounded-xl p-4 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold mb-2">
              Beat {(noteInput.beatIndex % COLS) + 1} Note
            </h4>
            <input
              type="text"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              value={noteInput.value}
              onChange={(e) =>
                setNoteInput({ ...noteInput, value: e.target.value.slice(0, 30) })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNote();
                if (e.key === 'Escape') setNoteInput(null);
              }}
              autoFocus
              placeholder="Add a note (max 30 chars)"
              maxLength={30}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1 text-sm rounded-lg hover:bg-accent transition-colors"
                onClick={() => setNoteInput(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={handleSaveNote}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current beat note banner */}
      {currentBeatIndex >= 0 &&
        cellNotes?.[String(currentBeatIndex)] && (
          <div className="mt-1 px-2 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20">
            <p className="text-xs text-teal-400 truncate">
              <span className="font-medium">Note:</span>{' '}
              {cellNotes[String(currentBeatIndex)]}
            </p>
          </div>
        )}
    </div>
  );
}

// ─── Grid Row (memoized) ──────────────────────────────

interface GridRowProps {
  row: number;
  beats: number[];
  currentBeatIndex: number;
  phraseMap: PhraseMap | null;
  cellSize: number;
  gap: number;
  rowHeight: number;
  loopStart: number | null;
  loopEnd: number | null;
  cellNotes?: Record<string, string>;
  onCellClick: (beatIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, beatIndex: number) => void;
}

function GridRow({
  row,
  beats,
  currentBeatIndex,
  phraseMap,
  cellSize,
  gap,
  rowHeight,
  loopStart,
  loopEnd,
  cellNotes,
  onCellClick,
  onContextMenu,
}: GridRowProps) {
  const cells: React.ReactNode[] = [];

  for (let col = 0; col < COLS; col++) {
    const globalBeatIndex = row * COLS + col;

    if (globalBeatIndex >= beats.length) {
      // Empty spacer cell
      cells.push(
        <div
          key={col}
          style={{ width: cellSize, height: cellSize }}
        />,
      );
      continue;
    }

    // Cell state
    let state: CellState = 'upcoming';
    if (globalBeatIndex === currentBeatIndex) {
      state = 'current';
    } else if (globalBeatIndex < currentBeatIndex) {
      state = 'played';
    }

    // Phrase color
    const phrase = phraseMap ? findPhraseForBeat(globalBeatIndex, phraseMap) : null;
    const phraseColor = phrase ? getPhraseColor(phrase.index) : '#666';

    // Is this the first beat of a phrase?
    const isPhraseStart = phrase ? globalBeatIndex === phrase.startBeatIndex : false;

    // Row label (eight-count: 1,2,3,4)
    const rowInPhrase = phrase
      ? Math.floor((globalBeatIndex - phrase.startBeatIndex) / COLS)
      : Math.floor(globalBeatIndex / COLS);
    const rowLabel = col === 0 ? rowInPhrase + 1 : null;

    // A/B loop markers
    const beatTimeMs = beats[globalBeatIndex] * 1000;
    const isLoopA =
      loopStart !== null && Math.abs(beatTimeMs - loopStart) < LOOP_TOLERANCE_MS;
    const isLoopB =
      loopEnd !== null && Math.abs(beatTimeMs - loopEnd) < LOOP_TOLERANCE_MS;

    // Cell note
    const hasNote = !!cellNotes?.[String(globalBeatIndex)];

    cells.push(
      <GridCell
        key={col}
        globalBeatIndex={globalBeatIndex}
        state={state}
        phraseColor={phraseColor}
        isPhraseStart={isPhraseStart}
        rowLabel={rowLabel}
        isLoopA={isLoopA}
        isLoopB={isLoopB}
        hasNote={hasNote}
        cellSize={cellSize}
        onClick={onCellClick}
        onContextMenu={onContextMenu}
      />,
    );
  }

  return (
    <div
      className="absolute flex"
      style={{
        top: row * rowHeight,
        left: 0,
        right: 0,
        gap: gap,
        padding: `0 ${gap}px`,
        height: rowHeight,
        alignItems: 'flex-start',
      }}
    >
      {cells}
    </div>
  );
}

// ─── Grid Cell ────────────────────────────────────────

interface GridCellProps {
  globalBeatIndex: number;
  state: CellState;
  phraseColor: string;
  isPhraseStart: boolean;
  rowLabel: number | null;
  isLoopA: boolean;
  isLoopB: boolean;
  hasNote: boolean;
  cellSize: number;
  onClick: (beatIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, beatIndex: number) => void;
}

function GridCell({
  globalBeatIndex,
  state,
  phraseColor,
  isPhraseStart,
  rowLabel,
  isLoopA,
  isLoopB,
  hasNote,
  cellSize,
  onClick,
  onContextMenu,
}: GridCellProps) {
  const isCurrent = state === 'current';
  const isPlayed = state === 'played';

  // Background color based on state
  let bgColor: string;
  let opacity = 1;
  let borderColor = 'transparent';

  if (isCurrent) {
    bgColor = phraseColor;
    borderColor = '#ffffff';
  } else if (isPlayed) {
    bgColor = 'hsl(var(--muted))';
    opacity = 0.5;
  } else {
    bgColor = phraseColor;
    opacity = 0.7;
  }

  return (
    <div
      className="relative rounded-md cursor-pointer select-none transition-all duration-75 hover:brightness-110 active:scale-95"
      style={{
        width: cellSize,
        height: cellSize,
        backgroundColor: bgColor,
        opacity,
        border: `2px solid ${borderColor}`,
        boxShadow: isCurrent ? `0 0 12px ${phraseColor}80` : undefined,
        transform: isCurrent ? 'scale(1.05)' : undefined,
      }}
      onClick={() => onClick(globalBeatIndex)}
      onContextMenu={(e) => onContextMenu(e, globalBeatIndex)}
      title={`Beat ${globalBeatIndex + 1}`}
    >
      {/* Phrase start indicator (top border) */}
      {isPhraseStart && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: phraseColor }}
        />
      )}

      {/* Row label (eight-count number) */}
      {rowLabel !== null && (
        <span
          className="absolute text-white/70 font-bold pointer-events-none"
          style={{
            fontSize: cellSize * 0.26,
            top: '1px',
            left: '2px',
            lineHeight: 1,
          }}
        >
          {rowLabel}
        </span>
      )}

      {/* Loop markers */}
      {(isLoopA || isLoopB) && (
        <span
          className="absolute top-0 right-0 flex items-center justify-center rounded-bl-md text-[9px] font-bold text-white"
          style={{
            width: 14,
            height: 14,
            backgroundColor: 'hsl(var(--primary))',
          }}
        >
          {isLoopA ? 'A' : 'B'}
        </span>
      )}

      {/* Note indicator */}
      {hasNote && (
        <div
          className="absolute bottom-0.5 left-0.5 rounded-full"
          style={{
            width: 5,
            height: 5,
            backgroundColor: '#14b8a6', // teal
          }}
        />
      )}

      {/* Current beat glow layers */}
      {isCurrent && (
        <>
          <div
            className="absolute inset-0 rounded-md animate-pulse"
            style={{
              backgroundColor: phraseColor,
              opacity: 0.3,
            }}
          />
        </>
      )}
    </div>
  );
}
