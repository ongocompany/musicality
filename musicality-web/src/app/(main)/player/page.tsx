'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useWebPlayerStore, type LocalTrack } from '@/stores/web-player-store';
import { useWebAudioPlayer } from '@/hooks/use-web-audio-player';
import { useWebVideoPlayer } from '@/hooks/use-web-video-player';
import { useWebYouTubePlayer, extractYouTubeVideoId } from '@/hooks/use-web-youtube-player';
import { analyzeTrackWeb } from '@/services/analysis-api';
import { WaveformBar } from '@/components/player/waveform-bar';
import { CountDisplay } from '@/components/player/count-display';
import { PhraseGrid } from '@/components/player/phrase-grid';
import { TapTempoPanel } from '@/components/player/tap-tempo-panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DanceStyle } from '@/utils/beat-counter';
import { computePhraseMap, phrasesFromBeatIndices, extractBoundaries, type PhraseMap } from '@/utils/phrase-detector';
import { generateSyntheticAnalysis } from '@/utils/beat-generator';
import { useTrackSync } from '@/hooks/use-track-sync';

// ─── Helpers ─────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const ACCEPTED_AUDIO = '.mp3,.m4a,.wav,.ogg,.flac,.aac,.wma,.opus';
const ACCEPTED_VIDEO = '.mp4,.mov,.webm,.mkv';
const ACCEPTED_ALL = `${ACCEPTED_AUDIO},${ACCEPTED_VIDEO}`;
const SPEED_OPTIONS = [0.5, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];
const YT_CONTAINER_ID = 'yt-player-container';
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

  const audioPlayer = useWebAudioPlayer();
  const videoPlayer = useWebVideoPlayer();
  const ytPlayer = useWebYouTubePlayer();
  const trackSync = useTrackSync();

  // Unified controls based on current media type
  const mediaType = currentTrack?.mediaType ?? 'audio';
  const togglePlay = mediaType === 'youtube' ? ytPlayer.togglePlay : mediaType === 'video' ? videoPlayer.togglePlay : audioPlayer.togglePlay;
  const seekTo = mediaType === 'youtube' ? ytPlayer.seekTo : mediaType === 'video' ? videoPlayer.seekTo : audioPlayer.seekTo;

  const [dragOver, setDragOver] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [danceStyle, setDanceStyle] = useState<DanceStyle>('bachata');
  const [offsetBeatIndex, setOffsetBeatIndex] = useState<number | null>(null);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cellNotes, setCellNotes] = useState<Record<string, string>>({});
  const [userBoundaries, setUserBoundaries] = useState<number[] | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showTapTempo, setShowTapTempo] = useState(false);
  const [analysisElapsed, setAnalysisElapsed] = useState(0);
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track analysis elapsed time
  const isAnalyzing = currentTrack?.analysisStatus === 'analyzing';
  useEffect(() => {
    if (isAnalyzing) {
      setAnalysisElapsed(0);
      analysisTimerRef.current = setInterval(() => {
        setAnalysisElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (analysisTimerRef.current) {
        clearInterval(analysisTimerRef.current);
        analysisTimerRef.current = null;
      }
      setAnalysisElapsed(0);
    }
    return () => {
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
    };
  }, [isAnalyzing]);

  // Reset offset & phrase data when track changes
  useEffect(() => {
    setOffsetBeatIndex(null);
    setCellNotes({});
    setUserBoundaries(null);
  }, [currentTrack?.id]);

  // ─── Phrase map ───────────────────────────────────────

  const phraseMap: PhraseMap | null = useMemo(() => {
    if (!currentTrack?.analysis) return null;
    const { beats, downbeats, phraseBoundaries, sections } = currentTrack.analysis;
    if (beats.length === 0) return null;

    // User-defined boundaries take priority
    if (userBoundaries) {
      return phrasesFromBeatIndices(userBoundaries, beats);
    }

    return computePhraseMap(
      beats,
      downbeats,
      offsetBeatIndex,
      phraseBoundaries,
      sections,
    );
  }, [currentTrack?.analysis, offsetBeatIndex, userBoundaries]);

  // ─── Phrase grid handlers ─────────────────────────────

  const handleSeekAndPlay = useCallback(
    (beatTimeMs: number) => {
      seekTo(beatTimeMs);
      if (!isPlaying) togglePlay();
    },
    [seekTo, isPlaying, togglePlay],
  );

  const handleSeekOnly = useCallback(
    (beatTimeMs: number) => {
      seekTo(beatTimeMs);
    },
    [seekTo],
  );

  const handleStartPhraseHere = useCallback(
    (globalBeatIndex: number) => {
      if (!phraseMap) return;
      const existing = extractBoundaries(phraseMap);
      // Add new boundary, remove any within ±4 beats
      const filtered = existing.filter((b) => Math.abs(b - globalBeatIndex) > 4);
      filtered.push(globalBeatIndex);
      filtered.sort((a, b) => a - b);
      setUserBoundaries(filtered);
    },
    [phraseMap],
  );

  const handleMergeWithPrevious = useCallback(
    (globalBeatIndex: number) => {
      if (!phraseMap) return;
      const existing = extractBoundaries(phraseMap);
      // Remove the boundary that is closest to (or equal to) globalBeatIndex
      let closestIdx = -1;
      let closestDist = Infinity;
      for (let i = 0; i < existing.length; i++) {
        const d = Math.abs(existing[i] - globalBeatIndex);
        if (d < closestDist && existing[i] > 0) {
          closestDist = d;
          closestIdx = i;
        }
      }
      if (closestIdx >= 0 && closestDist <= 8) {
        const filtered = existing.filter((_, i) => i !== closestIdx);
        setUserBoundaries(filtered.length > 0 ? filtered : null);
      }
    },
    [phraseMap],
  );

  const handleSetCellNote = useCallback(
    (beatIndex: number, note: string) => {
      setCellNotes((prev) => ({ ...prev, [String(beatIndex)]: note }));
    },
    [],
  );

  const handleClearCellNote = useCallback(
    (beatIndex: number) => {
      setCellNotes((prev) => {
        const next = { ...prev };
        delete next[String(beatIndex)];
        return next;
      });
    },
    [],
  );

  const handleSetLoopFromBeat = useCallback(
    (beatTimeMs: number) => {
      if (loopStart === null) {
        setLoopStart(beatTimeMs);
      } else if (loopEnd === null && beatTimeMs > loopStart) {
        setLoopEnd(beatTimeMs);
      } else {
        // Reset and set new A
        clearLoop();
        setLoopStart(beatTimeMs);
      }
    },
    [loopStart, loopEnd, setLoopStart, setLoopEnd, clearLoop],
  );

  // ─── Apply tap tempo BPM ────────────────────────────────

  const handleApplyTapBpm = useCallback(
    (tapBpm: number) => {
      if (!currentTrack || duration <= 0) return;

      // Use current position as anchor point (the "beat 1")
      const anchorMs = position;
      const synth = generateSyntheticAnalysis(tapBpm, duration, anchorMs);

      // Apply as analysis on current track
      updateTrack(currentTrack.id, {
        analysisStatus: 'done',
        analysis: {
          ...synth,
          trackId: currentTrack.id,
        },
      });

      // Set offset to the anchor beat index
      const anchorSec = anchorMs / 1000;
      let bestIdx = 0;
      let bestDist = Math.abs(synth.beats[0] - anchorSec);
      for (let i = 1; i < synth.beats.length; i++) {
        const dist = Math.abs(synth.beats[i] - anchorSec);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        } else break;
      }
      setOffsetBeatIndex(bestIdx);

      // Reset user phrase boundaries since we have new beats
      setUserBoundaries(null);
    },
    [currentTrack, duration, position, updateTrack],
  );

  // ─── File handling ──────────────────────────────────────

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      for (const file of fileArr) {
        const isAudio = file.type.startsWith('audio/');
        const isVideo = file.type.startsWith('video/');
        if (!isAudio && !isVideo) continue;

        const id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const fileUrl = URL.createObjectURL(file);
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const title = file.name.replace(/\.[^.]+$/, '');

        const track: LocalTrack = {
          id,
          title,
          mediaType: isVideo ? 'video' : 'audio',
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

  // ─── YouTube URL handler ────────────────────────────

  const handleAddYouTube = useCallback(() => {
    const videoId = extractYouTubeVideoId(youtubeUrlInput.trim());
    if (!videoId) return;

    const id = `yt_${Date.now()}_${videoId}`;
    const track: LocalTrack = {
      id,
      title: `YouTube: ${videoId}`,
      mediaType: 'youtube',
      fileUrl: '',
      duration: null,
      fileSize: null,
      format: 'youtube',
      youtubeUrl: youtubeUrlInput.trim(),
      youtubeVideoId: videoId,
      analysisStatus: 'idle',
    };

    addTrack(track);
    setCurrentTrack(track);
    setYoutubeUrlInput('');
  }, [youtubeUrlInput, addTrack, setCurrentTrack]);

  // Initialize YouTube player when track changes to YouTube type
  useEffect(() => {
    if (currentTrack?.mediaType === 'youtube' && currentTrack.youtubeVideoId) {
      // Small delay to ensure DOM element is rendered
      const timer = setTimeout(() => {
        ytPlayer.initPlayer(YT_CONTAINER_ID, currentTrack.youtubeVideoId!);
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, currentTrack?.mediaType]);

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            + Add Files
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => trackSync.syncAllToCloud()}
            disabled={trackSync.syncStatus === 'syncing'}
            title="Upload all analyzed tracks to cloud"
          >
            {trackSync.syncStatus === 'syncing' ? '⏳' : '☁️↑'} Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => trackSync.loadFromCloud()}
            disabled={trackSync.syncStatus === 'syncing'}
            title="Load tracks from cloud"
          >
            {trackSync.syncStatus === 'syncing' ? '⏳' : '☁️↓'} Load
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_ALL}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* YouTube URL input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="YouTube URL (paste and press Enter)"
          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          value={youtubeUrlInput}
          onChange={(e) => setYoutubeUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddYouTube();
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddYouTube}
          disabled={!youtubeUrlInput.trim()}
        >
          + YouTube
        </Button>
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
            Drag & drop audio or video files here
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            MP3, M4A, WAV, FLAC, MP4, MOV, WebM supported
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
                    ref={videoPlayer.bindVideoElement}
                    src={currentTrack.fileUrl}
                    className="w-full max-h-[400px] object-contain"
                    playsInline
                    preload="auto"
                  />
                  {/* Count overlay on video */}
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
                    <div id={YT_CONTAINER_ID} className="w-full h-full" />
                  </div>
                  {/* Count overlay on YouTube */}
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
                        className="!py-1"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Count Display (audio-only, standalone when analyzed) */}
              {currentTrack.mediaType === 'audio' && hasBeats && (
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

              {/* Tap Tempo Panel */}
              {currentTrack && (
                <TapTempoPanel
                  onApplyBpm={handleApplyTapBpm}
                  currentBpm={analysis?.bpm ?? null}
                  expanded={showTapTempo}
                  onToggle={() => setShowTapTempo(!showTapTempo)}
                />
              )}

              {/* PhraseGrid (when analyzed) */}
              {hasBeats && phraseMap && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <button
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowGrid(!showGrid)}
                    >
                      {showGrid ? '▼ Phrase Grid' : '▶ Phrase Grid'}
                    </button>
                    {userBoundaries && (
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setUserBoundaries(null)}
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
                      onSeekAndPlay={handleSeekAndPlay}
                      onSeekOnly={handleSeekOnly}
                      onStartPhraseHere={handleStartPhraseHere}
                      onMergeWithPrevious={handleMergeWithPrevious}
                      onSetLoopPoint={handleSetLoopFromBeat}
                      onClearLoop={clearLoop}
                      loopStart={loopStart}
                      loopEnd={loopEnd}
                      cellNotes={cellNotes}
                      onSetCellNote={handleSetCellNote}
                      onClearCellNote={handleClearCellNote}
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
                      <span className="text-muted-foreground text-xs">
                        {track.mediaType === 'youtube' ? '▶' : track.mediaType === 'video' ? '🎬' : '🎵'}
                      </span>
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
                      {track.analysisStatus === 'analyzing' && (
                        <>
                          {' · '}
                          <svg className="inline animate-spin h-3 w-3 text-primary ml-0.5 mr-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Analyzing...
                        </>
                      )}
                      {track.remoteTrack ? ' · ☁️' : ''}
                      {!track.file && !track.youtubeVideoId && ' · 📂 needs file'}
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

                  {/* Cloud sync shortcut */}
                  {track.analysis && !track.remoteTrack && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-blue-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        trackSync.syncTrackToCloud(track);
                      }}
                      title="Sync to cloud"
                    >
                      <span className="text-xs">☁️</span>
                    </Button>
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
        <span>T: Tap Tempo</span>
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
