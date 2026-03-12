'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useWebPlayerStore, type LocalTrack } from '@/stores/web-player-store';
import { useWebAudioPlayer } from '@/hooks/use-web-audio-player';
import { useWebVideoPlayer } from '@/hooks/use-web-video-player';
import { useWebYouTubePlayer, extractYouTubeVideoId } from '@/hooks/use-web-youtube-player';
import { analyzeTrackWeb } from '@/services/analysis-api';
import type { DanceStyle } from '@/utils/beat-counter';
import { computePhraseMap, phrasesFromBeatIndices, extractBoundaries, type PhraseMap } from '@/utils/phrase-detector';
import { generateSyntheticAnalysis } from '@/utils/beat-generator';
import { useTrackSync } from '@/hooks/use-track-sync';
import { PlayerSidebar } from '@/components/player/player-sidebar';
import { PlayerMain } from '@/components/player/player-main';

const YT_CONTAINER_ID = 'yt-player-container';

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

  const [danceStyle, setDanceStyle] = useState<DanceStyle>('bachata');
  const [offsetBeatIndex, setOffsetBeatIndex] = useState<number | null>(null);
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

      const anchorMs = position;
      const synth = generateSyntheticAnalysis(tapBpm, duration, anchorMs);

      updateTrack(currentTrack.id, {
        analysisStatus: 'done',
        analysis: {
          ...synth,
          trackId: currentTrack.id,
        },
      });

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

  const handleAddYouTube = useCallback(
    (url: string) => {
      const videoId = extractYouTubeVideoId(url);
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
        youtubeUrl: url,
        youtubeVideoId: videoId,
        analysisStatus: 'idle',
      };

      addTrack(track);
      setCurrentTrack(track);
    },
    [addTrack, setCurrentTrack],
  );

  // Initialize YouTube player when track changes to YouTube type
  useEffect(() => {
    if (currentTrack?.mediaType === 'youtube' && currentTrack.youtubeVideoId) {
      const timer = setTimeout(() => {
        ytPlayer.initPlayer(YT_CONTAINER_ID, currentTrack.youtubeVideoId!);
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, currentTrack?.mediaType]);

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

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-64px)] flex overflow-hidden">
      <PlayerSidebar
        tracks={tracks}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onSelectTrack={setCurrentTrack}
        onAddFiles={handleFiles}
        onAddYouTube={handleAddYouTube}
        onRemoveTrack={removeTrack}
        onAnalyze={handleAnalyze}
        onSyncTrack={(track) => trackSync.syncTrackToCloud(track)}
        onSyncAll={() => trackSync.syncAllToCloud()}
        onLoadFromCloud={() => trackSync.loadFromCloud()}
        syncStatus={trackSync.syncStatus}
      />
      <PlayerMain
        currentTrack={currentTrack}
        position={position}
        duration={duration}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        phraseMap={phraseMap}
        offsetBeatIndex={offsetBeatIndex}
        danceStyle={danceStyle}
        userBoundaries={userBoundaries}
        showGrid={showGrid}
        showTapTempo={showTapTempo}
        cellNotes={cellNotes}
        loopEnabled={loopEnabled}
        loopStart={loopStart}
        loopEnd={loopEnd}
        analysisElapsed={analysisElapsed}
        videoPlayerRef={videoPlayer.bindVideoElement}
        ytContainerId={YT_CONTAINER_ID}
        togglePlay={togglePlay}
        seekTo={seekTo}
        setIsSeeking={setIsSeeking}
        setPlaybackRate={setPlaybackRate}
        setDanceStyle={setDanceStyle}
        setShowGrid={setShowGrid}
        setShowTapTempo={setShowTapTempo}
        setUserBoundaries={setUserBoundaries}
        onSeekAndPlay={handleSeekAndPlay}
        onSeekOnly={handleSeekOnly}
        onStartPhraseHere={handleStartPhraseHere}
        onMergeWithPrevious={handleMergeWithPrevious}
        onSetCellNote={handleSetCellNote}
        onClearCellNote={handleClearCellNote}
        onSetLoopFromBeat={handleSetLoopFromBeat}
        onSetA={handleSetA}
        onSetB={handleSetB}
        onClearLoop={clearLoop}
        onApplyTapBpm={handleApplyTapBpm}
        onAnalyze={handleAnalyze}
        onSetDownbeat={handleSetDownbeat}
      />
    </div>
  );
}
