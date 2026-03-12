'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CountDisplay } from './count-display';
import { PhraseGrid } from './phrase-grid';
import { TapTempoPanel } from './tap-tempo-panel';
import { WaveformBar } from './waveform-bar';
import type { LocalTrack } from '@/stores/web-player-store';
import type { DanceStyle } from '@/utils/beat-counter';
import type { PhraseMap } from '@/utils/phrase-detector';
import { findCurrentBeatIndex } from '@/utils/beat-counter';
import { findPhraseForBeat } from '@/utils/phrase-detector';

// ─── Constants ────────────────────────────────────────
const SPEED_OPTIONS = [0.5, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];
const DANCE_STYLES: { value: DanceStyle; label: string }[] = [
  { value: 'bachata', label: 'Bachata' },
  { value: 'salsa-on1', label: 'Salsa On1' },
  { value: 'salsa-on2', label: 'Salsa On2' },
];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ─── Props ────────────────────────────────────────────
interface PlayerMainProps {
  currentTrack: LocalTrack | null;
  position: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;

  // Analysis
  phraseMap: PhraseMap | null;
  offsetBeatIndex: number | null;
  danceStyle: DanceStyle;
  userBoundaries: number[] | null;

  // Grid & notes
  showGrid: boolean;
  showTapTempo: boolean;
  cellNotes: Record<string, string>;

  // Loop
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;

  // Analysis progress
  analysisElapsed: number;

  // Video
  videoPlayerRef: (el: HTMLVideoElement | null) => void;
  ytContainerId: string;

  // Callbacks
  togglePlay: () => void;
  seekTo: (posMs: number) => void;
  setIsSeeking: (seeking: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setDanceStyle: (style: DanceStyle) => void;
  setShowGrid: (show: boolean) => void;
  setShowTapTempo: (show: boolean) => void;
  setUserBoundaries: (b: number[] | null) => void;

  // Player callbacks
  onSeekAndPlay: (beatTimeMs: number) => void;
  onSeekOnly: (beatTimeMs: number) => void;
  onStartPhraseHere: (globalBeatIndex: number) => void;
  onMergeWithPrevious: (globalBeatIndex: number) => void;
  onSetCellNote: (beatIndex: number, note: string) => void;
  onClearCellNote: (beatIndex: number) => void;
  onSetLoopFromBeat: (beatTimeMs: number) => void;
  onSetA: () => void;
  onSetB: () => void;
  onClearLoop: () => void;
  onApplyTapBpm: (bpm: number) => void;
  onAnalyze: (track: LocalTrack) => void;
  onSetDownbeat: () => void;
}

export function PlayerMain({
  currentTrack,
  position,
  duration,
  isPlaying,
  playbackRate,
  phraseMap,
  offsetBeatIndex,
  danceStyle,
  userBoundaries,
  showGrid,
  showTapTempo,
  cellNotes,
  loopEnabled,
  loopStart,
  loopEnd,
  analysisElapsed,
  videoPlayerRef,
  ytContainerId,
  togglePlay,
  seekTo,
  setIsSeeking,
  setPlaybackRate: onSetPlaybackRate,
  setDanceStyle: onSetDanceStyle,
  setShowGrid: onSetShowGrid,
  setShowTapTempo: onSetShowTapTempo,
  setUserBoundaries: onSetUserBoundaries,
  onSeekAndPlay,
  onSeekOnly,
  onStartPhraseHere,
  onMergeWithPrevious,
  onSetCellNote,
  onClearCellNote,
  onSetLoopFromBeat,
  onSetA,
  onSetB,
  onClearLoop,
  onApplyTapBpm,
  onAnalyze,
  onSetDownbeat,
}: PlayerMainProps) {
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  const analysis = currentTrack?.analysis;
  const hasWaveform = analysis && analysis.waveformPeaks.length > 0;
  const hasBeats = analysis && analysis.beats.length > 0;
  const progress = duration > 0 ? position / duration : 0;

  // Compute current phrase index
  const phraseIndex = (() => {
    if (!hasBeats || !phraseMap) return undefined;
    const beatIdx = findCurrentBeatIndex(position, analysis!.beats);
    if (beatIdx < 0) return undefined;
    const phrase = findPhraseForBeat(beatIdx, phraseMap);
    return phrase?.index;
  })();

  if (!currentTrack) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <span className="text-4xl block mb-3">🎵</span>
          <p className="text-sm">Select a track to start playing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Track title */}
        <div className="text-center">
          <h2 className="text-lg font-semibold truncate">
            {currentTrack.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {currentTrack.mediaType === 'youtube'
              ? 'YouTube'
              : currentTrack.format?.toUpperCase()}
            {currentTrack.fileSize
              ? ` · ${(currentTrack.fileSize / (1024 * 1024)).toFixed(1)} MB`
              : ''}
            {analysis ? ` · ${Math.round(analysis.bpm)} BPM` : ''}
          </p>
        </div>

        {/* Video player */}
        {currentTrack.mediaType === 'video' && (
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video
              ref={videoPlayerRef}
              src={currentTrack.fileUrl}
              className="w-full max-h-[360px] object-contain"
              playsInline
              preload="auto"
            />
            {hasBeats && (
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 pointer-events-none">
                <CountDisplay
                  positionMs={position}
                  beats={analysis!.beats}
                  downbeats={analysis!.downbeats}
                  offsetBeatIndex={offsetBeatIndex}
                  danceStyle={danceStyle}
                  sections={analysis!.sections}
                  bpm={analysis!.bpm}
                  phraseIndex={phraseIndex}
                  className="!py-1"
                />
              </div>
            )}
          </div>
        )}

        {/* YouTube player */}
        {currentTrack.mediaType === 'youtube' && (
          <div className="relative rounded-lg overflow-hidden bg-black">
            <div className="aspect-video">
              <div id={ytContainerId} className="w-full h-full" />
            </div>
            {hasBeats && (
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 pointer-events-none">
                <CountDisplay
                  positionMs={position}
                  beats={analysis!.beats}
                  downbeats={analysis!.downbeats}
                  offsetBeatIndex={offsetBeatIndex}
                  danceStyle={danceStyle}
                  sections={analysis!.sections}
                  bpm={analysis!.bpm}
                  phraseIndex={phraseIndex}
                  className="!py-1"
                />
              </div>
            )}
          </div>
        )}

        {/* Count Display (audio-only, standalone) */}
        {currentTrack.mediaType === 'audio' && hasBeats && (
          <CountDisplay
            positionMs={position}
            beats={analysis!.beats}
            downbeats={analysis!.downbeats}
            offsetBeatIndex={offsetBeatIndex}
            danceStyle={danceStyle}
            sections={analysis!.sections}
            bpm={analysis!.bpm}
            phraseIndex={phraseIndex}
          />
        )}

        {/* Tap Tempo Panel */}
        <TapTempoPanel
          onApplyBpm={onApplyTapBpm}
          currentBpm={analysis?.bpm ?? null}
          expanded={showTapTempo}
          onToggle={() => onSetShowTapTempo(!showTapTempo)}
        />

        {/* PhraseGrid */}
        {hasBeats && phraseMap && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onSetShowGrid(!showGrid)}
              >
                {showGrid ? '▼ Phrase Grid' : '▶ Phrase Grid'}
              </button>
              {userBoundaries && (
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => onSetUserBoundaries(null)}
                  title="Reset to auto-detected phrases"
                >
                  Reset Phrases
                </button>
              )}
            </div>
            {showGrid && (
              <PhraseGrid
                positionMs={position}
                beats={analysis!.beats}
                phraseMap={phraseMap}
                isPlaying={isPlaying}
                onSeekAndPlay={onSeekAndPlay}
                onSeekOnly={onSeekOnly}
                onStartPhraseHere={onStartPhraseHere}
                onMergeWithPrevious={onMergeWithPrevious}
                onSetLoopPoint={onSetLoopFromBeat}
                onClearLoop={onClearLoop}
                loopStart={loopStart}
                loopEnd={loopEnd}
                cellNotes={cellNotes}
                onSetCellNote={onSetCellNote}
                onClearCellNote={onClearCellNote}
              />
            )}
          </div>
        )}

        {/* Waveform or simple seek bar */}
        {hasWaveform ? (
          <div className="space-y-1">
            <WaveformBar
              peaks={analysis!.waveformPeaks}
              progress={progress}
              duration={duration}
              loopStart={loopStart}
              loopEnd={loopEnd}
              phraseMap={phraseMap}
              onSeek={seekTo}
              onSeekStart={() => setIsSeeking(true)}
              onSeekEnd={() => setIsSeeking(false)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        ) : (
          <SimpleSeekBar
            progress={progress}
            duration={duration}
            position={position}
            loopStart={loopStart}
            loopEnd={loopEnd}
            onSeek={seekTo}
            onSeekStart={() => setIsSeeking(true)}
            onSeekEnd={() => setIsSeeking(false)}
          />
        )}

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => seekTo(Math.max(0, position - 5000))}
            title="Rewind 5s"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </Button>

          <Button
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={togglePlay}
            title="Play/Pause (Space)"
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => seekTo(Math.min(duration, position + 5000))}
            title="Forward 5s"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 5 7 7-7 7" />
              <path d="M5 12h14" />
            </svg>
          </Button>
        </div>

        {/* Analysis progress bar */}
        {currentTrack.analysisStatus === 'analyzing' && (
          <div className="w-full rounded-full h-1.5 bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full animate-pulse"
              style={{
                width: `${Math.min(95, analysisElapsed * 1.5)}%`,
                transition: 'width 1s linear',
              }}
            />
          </div>
        )}

        {/* Secondary controls */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {/* Analyze */}
          {currentTrack.analysisStatus === 'idle' && currentTrack.file && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => onAnalyze(currentTrack)}
            >
              Analyze
            </Button>
          )}
          {currentTrack.analysisStatus === 'analyzing' && (
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs text-muted-foreground">
                Analyzing... {analysisElapsed > 0 && `${analysisElapsed}s`}
              </span>
            </div>
          )}
          {currentTrack.analysisStatus === 'error' && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 text-destructive"
              onClick={() => onAnalyze(currentTrack)}
            >
              Retry Analysis
            </Button>
          )}

          {/* "Now is 1" */}
          {hasBeats && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={onSetDownbeat}
              title="Set current position as beat 1"
            >
              지금이 1
            </Button>
          )}

          {/* Dance style */}
          <div className="flex items-center gap-1">
            {DANCE_STYLES.map((s) => (
              <button
                key={s.value}
                className={cn(
                  'px-2 py-0.5 text-[11px] rounded-full border transition-colors',
                  danceStyle === s.value
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
                onClick={() => onSetDanceStyle(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Speed */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 min-w-[60px]"
              onClick={() => setSpeedMenuOpen(!speedMenuOpen)}
            >
              {playbackRate}x
            </Button>
            {speedMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setSpeedMenuOpen(false)}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[80px]">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      className={cn(
                        'block w-full text-left px-3 py-1 text-sm rounded hover:bg-accent transition-colors',
                        playbackRate === s && 'bg-primary/10 text-primary font-medium',
                      )}
                      onClick={() => {
                        onSetPlaybackRate(s);
                        setSpeedMenuOpen(false);
                      }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* A-B Loop */}
          <div className="flex items-center gap-1">
            <Button
              variant={loopStart !== null ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 px-2"
              onClick={onSetA}
              title="Set loop start"
            >
              A
            </Button>
            <Button
              variant={loopEnd !== null ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 px-2"
              onClick={onSetB}
              disabled={loopStart === null}
              title="Set loop end"
            >
              B
            </Button>
            {loopEnabled && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                onClick={onClearLoop}
                title="Clear loop"
              >
                ✕
              </Button>
            )}
            {loopEnabled && (
              <span className="text-[10px] text-muted-foreground">
                {formatTime(loopStart!)} → {formatTime(loopEnd!)}
              </span>
            )}
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="text-center text-[10px] text-muted-foreground space-x-3">
          <span>Space: Play/Pause</span>
          <span>←→: ±5 sec</span>
          <span>T: Tap Tempo</span>
        </div>
      </div>
    </div>
  );
}

// ─── Simple seek bar (fallback) ─────────────────────────
function SimpleSeekBar({
  progress,
  duration,
  position,
  loopStart,
  loopEnd,
  onSeek,
  onSeekStart,
  onSeekEnd,
}: {
  progress: number;
  duration: number;
  position: number;
  loopStart: number | null;
  loopEnd: number | null;
  onSeek: (posMs: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const posFromX = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onSeekStart();
      onSeek(posFromX(e.clientX));
      const onMove = (ev: MouseEvent) => onSeek(posFromX(ev.clientX));
      const onUp = (ev: MouseEvent) => {
        onSeek(posFromX(ev.clientX));
        onSeekEnd();
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [onSeek, onSeekStart, onSeekEnd, posFromX],
  );

  const pct = progress * 100;
  const loopStartPct = loopStart != null && duration > 0 ? (loopStart / duration) * 100 : null;
  const loopEndPct = loopEnd != null && duration > 0 ? (loopEnd / duration) * 100 : null;

  return (
    <div className="space-y-1">
      <div
        ref={ref}
        className="relative h-2 rounded-full bg-muted cursor-pointer group"
        onMouseDown={handleMouseDown}
      >
        {loopStartPct != null && loopEndPct != null && (
          <div
            className="absolute top-0 bottom-0 bg-primary/20 rounded-full"
            style={{ left: `${loopStartPct}%`, width: `${loopEndPct - loopStartPct}%` }}
          />
        )}
        <div
          className="absolute top-0 left-0 bottom-0 rounded-full bg-primary transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatTime(position)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
