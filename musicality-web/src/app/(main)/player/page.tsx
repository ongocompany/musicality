'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebPlayerStore, type LocalTrack } from '@/stores/web-player-store';
import { useWebAudioPlayer } from '@/hooks/use-web-audio-player';
import { analyzeTrackWeb } from '@/services/analysis-api';
import { WaveformBar } from '@/components/player/waveform-bar';
import { CountDisplay } from '@/components/player/count-display';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DanceStyle } from '@/utils/beat-counter';

// ─── Helpers ─────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const ACCEPTED_AUDIO = '.mp3,.m4a,.wav,.ogg,.flac,.aac,.wma,.opus';
const SPEED_OPTIONS = [0.5, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];
const DANCE_STYLES: { value: DanceStyle; label: string }[] = [
  { value: 'bachata', label: 'Bachata' },
  { value: 'salsa-on1', label: 'Salsa On1' },
  { value: 'salsa-on2', label: 'Salsa On2' },
];

// ─── Main Page ───────────────────────────────────────────

export default function PlayerPage() {
  const {
    tracks,
    addTrack,
    removeTrack,
    updateTrack,
    currentTrack,
    setCurrentTrack,
    isPlaying,
    position,
    duration,
    playbackRate,
    setPlaybackRate,
    setIsSeeking,
    loopEnabled,
    loopStart,
    loopEnd,
    setLoopStart,
    setLoopEnd,
    clearLoop,
  } = useWebPlayerStore();

  const { togglePlay, seekTo } = useWebAudioPlayer();

  const [dragOver, setDragOver] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [danceStyle, setDanceStyle] = useState<DanceStyle>('bachata');
  const [offsetBeatIndex, setOffsetBeatIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset offset when track changes
  useEffect(() => {
    setOffsetBeatIndex(null);
  }, [currentTrack?.id]);

  // ─── File handling ──────────────────────────────────────

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      for (const file of fileArr) {
        if (!file.type.startsWith('audio/')) continue;

        const id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const fileUrl = URL.createObjectURL(file);
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const title = file.name.replace(/\.[^.]+$/, '');

        const track: LocalTrack = {
          id,
          title,
          mediaType: 'audio',
          fileUrl,
          file,
          duration: null,
          fileSize: file.size,
          format: ext,
          analysisStatus: 'idle',
        };

        addTrack(track);

        if (!useWebPlayerStore.getState().currentTrack) {
          setCurrentTrack(track);
        }
      }
    },
    [addTrack, setCurrentTrack],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // ─── Analysis ────────────────────────────────────────────

  const handleAnalyze = useCallback(
    async (track: LocalTrack) => {
      if (!track.file || track.analysisStatus === 'analyzing') return;

      updateTrack(track.id, { analysisStatus: 'analyzing' });

      try {
        const result = await analyzeTrackWeb(track.file);
        updateTrack(track.id, {
          analysisStatus: 'done',
          analysis: {
            id: '',
            trackId: track.id,
            userId: '',
            bpm: result.bpm,
            beats: result.beats,
            downbeats: result.downbeats,
            beatsPerBar: result.beatsPerBar,
            confidence: result.confidence,
            sections: result.sections.map((s) => ({
              label: s.label as any,
              startTime: s.startTime,
              endTime: s.endTime,
              confidence: s.confidence,
            })),
            phraseBoundaries: result.phraseBoundaries,
            waveformPeaks: result.waveformPeaks,
            fingerprint: result.fingerprint ?? null,
            createdAt: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        updateTrack(track.id, { analysisStatus: 'error' });
        console.error('Analysis failed:', err.message);
      }
    },
    [updateTrack],
  );

  // ─── "Now is 1" — set current beat as downbeat ─────────

  const handleSetDownbeat = useCallback(() => {
    if (!currentTrack?.analysis) return;
    const { beats } = currentTrack.analysis;
    if (beats.length === 0) return;

    // Find nearest beat to current position
    const posSec = position / 1000;
    let bestIdx = 0;
    let bestDist = Math.abs(beats[0] - posSec);
    for (let i = 1; i < beats.length; i++) {
      const dist = Math.abs(beats[i] - posSec);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      } else break;
    }
    setOffsetBeatIndex(bestIdx);
  }, [currentTrack?.analysis, position]);

  // ─── A-B Loop handlers ─────────────────────────────────

  const handleSetA = useCallback(() => {
    setLoopStart(position);
  }, [position, setLoopStart]);

  const handleSetB = useCallback(() => {
    if (loopStart !== null && position > loopStart) {
      setLoopEnd(position);
    }
  }, [position, loopStart, setLoopEnd]);

  // ─── Keyboard shortcuts ────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekTo(Math.max(0, position - 5000));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekTo(Math.min(duration, position + 5000));
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, seekTo, position, duration]);

  // ─── Derived values ────────────────────────────────────

  const progress = duration > 0 ? position / duration : 0;
  const analysis = currentTrack?.analysis;
  const hasWaveform = analysis && analysis.waveformPeaks.length > 0;
  const hasBeats = analysis && analysis.beats.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Player</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          + Add Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_AUDIO}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Drop zone (shown when no tracks) */}
      {tracks.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-16 transition-colors cursor-pointer',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50',
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="text-4xl mb-3">🎵</span>
          <p className="text-lg font-medium text-foreground">
            Drag & drop audio files here
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            MP3, M4A, WAV, OGG, FLAC supported
          </p>
        </div>
      )}

      {/* Player + Tracklist layout */}
      {tracks.length > 0 && (
        <div
          className="space-y-4"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {dragOver && (
            <div className="rounded-lg border-2 border-dashed border-primary bg-primary/5 p-4 text-center text-sm text-primary">
              Drop to add more files
            </div>
          )}

          {/* Now Playing */}
          {currentTrack && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              {/* Track title + analysis status */}
              <div className="text-center">
                <h2 className="text-lg font-semibold truncate">
                  {currentTrack.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {currentTrack.format?.toUpperCase()}
                  {currentTrack.fileSize
                    ? ` · ${(currentTrack.fileSize / (1024 * 1024)).toFixed(1)} MB`
                    : ''}
                  {analysis ? ` · ${Math.round(analysis.bpm)} BPM` : ''}
                </p>
              </div>

              {/* Count Display (when analyzed) */}
              {hasBeats && (
                <CountDisplay
                  positionMs={position}
                  beats={analysis!.beats}
                  downbeats={analysis!.downbeats}
                  offsetBeatIndex={offsetBeatIndex}
                  danceStyle={danceStyle}
                  sections={analysis!.sections}
                  bpm={analysis!.bpm}
                />
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

              {/* Controls */}
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => seekTo(Math.max(0, position - 5000))}
                  title="Rewind 5s (←)"
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
                  title="Forward 5s (→)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 5 7 7-7 7" />
                    <path d="M5 12h14" />
                  </svg>
                </Button>
              </div>

              {/* Secondary controls */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {/* Analyze button */}
                {currentTrack.analysisStatus === 'idle' && currentTrack.file && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleAnalyze(currentTrack)}
                  >
                    🔍 Analyze
                  </Button>
                )}
                {currentTrack.analysisStatus === 'analyzing' && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Analyzing...
                  </span>
                )}
                {currentTrack.analysisStatus === 'error' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 text-destructive"
                    onClick={() => handleAnalyze(currentTrack)}
                  >
                    Retry Analysis
                  </Button>
                )}

                {/* "Now is 1" button (when analyzed) */}
                {hasBeats && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={handleSetDownbeat}
                    title="Set current position as beat 1"
                  >
                    지금이 1
                  </Button>
                )}

                {/* Dance style selector */}
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
                      onClick={() => setDanceStyle(s.value)}
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
                              setPlaybackRate(s);
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
                    onClick={handleSetA}
                    title="Set loop start point"
                  >
                    A
                  </Button>
                  <Button
                    variant={loopEnd !== null ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={handleSetB}
                    disabled={loopStart === null}
                    title="Set loop end point"
                  >
                    B
                  </Button>
                  {loopEnabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                      onClick={clearLoop}
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
            </div>
          )}

          {/* Track list */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/30">
              <h3 className="text-sm font-medium text-muted-foreground">
                Tracks ({tracks.length})
              </h3>
            </div>
            <div className="divide-y divide-border">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-accent/50',
                    currentTrack?.id === track.id && 'bg-primary/5',
                  )}
                  onClick={() => setCurrentTrack(track)}
                >
                  <div className="w-5 text-center shrink-0">
                    {currentTrack?.id === track.id && isPlaying ? (
                      <span className="text-primary text-sm">▶</span>
                    ) : currentTrack?.id === track.id ? (
                      <span className="text-primary text-sm">❚❚</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">🎵</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm truncate',
                        currentTrack?.id === track.id
                          ? 'text-primary font-medium'
                          : 'text-foreground',
                      )}
                    >
                      {track.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {track.format?.toUpperCase()}
                      {track.fileSize
                        ? ` · ${(track.fileSize / (1024 * 1024)).toFixed(1)} MB`
                        : ''}
                      {track.analysis ? ` · ${Math.round(track.analysis.bpm)} BPM` : ''}
                      {track.analysisStatus === 'analyzing' && ' · Analyzing...'}
                    </p>
                  </div>

                  {/* Analyze shortcut */}
                  {track.analysisStatus === 'idle' && track.file && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAnalyze(track);
                      }}
                      title="Analyze"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    </Button>
                  )}
                  {track.analysisStatus === 'done' && (
                    <span className="text-[10px] text-green-500 shrink-0">✓</span>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTrack(track.id);
                    }}
                    title="Remove"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts help */}
      <div className="text-center text-xs text-muted-foreground space-x-4">
        <span>Space: Play/Pause</span>
        <span>←→: ±5 sec</span>
      </div>
    </div>
  );
}

// ─── Simple seek bar (fallback when no waveform) ─────────

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
