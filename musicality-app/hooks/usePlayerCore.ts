/**
 * usePlayerCore — 모든 플레이어 화면에서 공유하는 핵심 로직
 *
 * 포함: store 구독, 플레이어 통합, beat/phrase 계산, 핸들러
 * 미포함: formation 편집, 비디오 collapse/fullscreen, focusMode, UI state
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { syncAllEditionsForTrack, restoreEditionsFromServer } from '../services/editionSyncService';
import { ensureFileAvailable } from '../services/fileImport';

import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTapTempoStore } from '../stores/tapTempoStore';
import { useAudioPlayer } from './useAudioPlayer';
import { useVideoPlayer } from './useVideoPlayer';
import { useYouTubePlayer } from './useYouTubePlayer';

import { analyzeTrack } from '../services/analysisApi';
import { buildPhraseNoteFile, exportPhraseNote, pickPhraseNoteFile, findMatchingTrack } from '../services/phraseNoteService';
import { ImportedPhraseNote } from '../types/phraseNote';
import { getPhraseCountInfo, computeReferenceIndex, findNearestBeatIndex, CountInfo } from '../utils/beatCounter';
import { detectPhrasesRuleBased, detectPhrasesFromUserMark, phrasesFromBoundaries, phrasesFromBeatIndices } from '../utils/phraseDetector';
import { generateSyntheticAnalysis } from '../utils/beatGenerator';

export function usePlayerCore() {
  const { t } = useTranslation();
  const router = useRouter();

  // ─── Player Store ───
  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    setPlaybackRate, loopEnabled, loopStart, loopEnd,
    setLoopStart, setLoopEnd, clearLoop, setIsSeeking,
    setTrackAnalysisStatus, setTrackAnalysis, setTrackPendingJobId,
    setTrackThumbnail, updateTrackData,
  } = usePlayerStore();
  const tracks = usePlayerStore((s) => s.tracks);

  // ─── Media type flags ───
  const isVideo = currentTrack?.mediaType === 'video';
  const isYouTube = currentTrack?.mediaType === 'youtube';
  const isVisual = isVideo || isYouTube;

  // ─── Player hooks ───
  const audioPlayer = useAudioPlayer();
  const videoPlayer = useVideoPlayer();
  const youtubePlayer = useYouTubePlayer();
  const togglePlay = isYouTube
    ? youtubePlayer.togglePlay
    : isVideo ? videoPlayer.togglePlay : audioPlayer.togglePlay;
  const seekTo = isYouTube
    ? youtubePlayer.seekTo
    : isVideo ? videoPlayer.seekTo : audioPlayer.seekTo;

  // ─── Tap Tempo ───
  const tapBpm = useTapTempoStore((s) => s.bpm);
  const tapPhase = useTapTempoStore((s) => s.phase);
  const recordTap = useTapTempoStore((s) => s.recordTap);
  const adjustBpm = useTapTempoStore((s) => s.adjustBpm);
  const resetTapTempo = useTapTempoStore((s) => s.reset);

  // ─── Settings Store ───
  const danceStyle = useSettingsStore((s) => s.danceStyle);
  const lookAheadMs = useSettingsStore((s) => s.lookAheadMs);
  const downbeatOffsets = useSettingsStore((s) => s.downbeatOffsets);
  const setDownbeatOffset = useSettingsStore((s) => s.setDownbeatOffset);
  const phraseDetectionMode = useSettingsStore((s) => s.phraseDetectionMode);
  const defaultBeatsPerPhrase = useSettingsStore((s) => s.defaultBeatsPerPhrase);
  const phraseMarks = useSettingsStore((s) => s.phraseMarks);
  const trackEditions = useSettingsStore((s) => s.trackEditions);
  const setServerEdition = useSettingsStore((s) => s.setServerEdition);
  const draftBoundaries = useSettingsStore((s) => s.draftBoundaries);
  const setDraftBoundaries = useSettingsStore((s) => s.setDraftBoundaries);
  const clearDraft = useSettingsStore((s) => s.clearDraft);
  const saveDraftAsEdition = useSettingsStore((s) => s.saveDraftAsEdition);
  const gridScrollMode = useSettingsStore((s) => s.gridScrollMode);
  const toggleGridScrollMode = useSettingsStore((s) => s.toggleGridScrollMode);
  const beatTimeOffsets = useSettingsStore((s) => s.beatTimeOffsets);
  const setBeatTimeOffset = useSettingsStore((s) => s.setBeatTimeOffset);
  const bpmOverrides = useSettingsStore((s) => s.bpmOverrides);
  const setBpmOverride = useSettingsStore((s) => s.setBpmOverride);
  const clearBpmOverride = useSettingsStore((s) => s.clearBpmOverride);
  const cellNotes = useSettingsStore((s) => s.cellNotes);
  const setCellNote = useSettingsStore((s) => s.setCellNote);
  const clearCellNote = useSettingsStore((s) => s.clearCellNote);
  const importedNotes = useSettingsStore((s) => s.importedNotes);
  const addImportedNote = useSettingsStore((s) => s.addImportedNote);
  const removeImportedNote = useSettingsStore((s) => s.removeImportedNote);
  const setActiveImportedNote = useSettingsStore((s) => s.setActiveImportedNote);

  // ─── Undo stack (PhraseNote) ───
  const undoStackRef = useRef<Record<string, number[][]>>({});
  const pushUndo = useCallback((trackId: string, boundaries: number[]) => {
    if (!undoStackRef.current[trackId]) undoStackRef.current[trackId] = [];
    undoStackRef.current[trackId].push([...boundaries]);
  }, []);
  const handleUndo = useCallback(() => {
    if (!currentTrack) return;
    const stack = undoStackRef.current[currentTrack.id];
    if (!stack || stack.length === 0) return;
    setDraftBoundaries(currentTrack.id, stack.pop()!);
  }, [currentTrack, setDraftBoundaries]);
  const canUndo = currentTrack
    ? (undoStackRef.current[currentTrack.id]?.length ?? 0) > 0
    : false;

  // ─── Analysis ───
  const analysis = currentTrack?.analysis;
  const offsetBeatIndex = currentTrack ? (downbeatOffsets[currentTrack.id] ?? null) : null;

  // ─── Imported notes ───
  const trackImportedNotes = useMemo(() => {
    if (!currentTrack) return [];
    return importedNotes.filter(n => n.trackId === currentTrack.id);
  }, [currentTrack?.id, importedNotes]);

  const activeImportedNote = useMemo(() => {
    return trackImportedNotes.find(n => n.isActive) ?? null;
  }, [trackImportedNotes]);

  const effectiveAnalysisData = useMemo(() => {
    if (activeImportedNote) {
      const pn = activeImportedNote.phraseNote;
      return {
        beats: pn.analysis.beats,
        downbeats: pn.analysis.downbeats,
        duration: pn.music.duration,
        offsetBeatIndex: pn.analysis.downbeatOffset,
        boundaries: pn.phrases.boundaries,
        beatsPerPhrase: pn.phrases.beatsPerPhrase,
        isImported: true,
      };
    }
    return null;
  }, [activeImportedNote]);

  // ─── Phrase map ───
  const phraseMap = useMemo(() => {
    if (effectiveAnalysisData?.isImported) {
      const { beats, boundaries, duration: dur } = effectiveAnalysisData;
      if (beats.length > 0 && boundaries.length > 0) {
        return phrasesFromBeatIndices(beats, boundaries, dur);
      }
    }
    if (!analysis || !analysis.beats || analysis.beats.length === 0) return undefined;

    const draft = currentTrack ? draftBoundaries[currentTrack.id] : undefined;
    if (draft && draft.length > 0) {
      return phrasesFromBeatIndices(analysis.beats, draft, analysis.duration);
    }

    const editions = currentTrack ? trackEditions[currentTrack.id] : undefined;
    if (editions) {
      const activeId = editions.activeEditionId;
      let boundaries: number[] | undefined;
      if (activeId === 'S') boundaries = editions.server?.boundaries;
      else boundaries = editions.userEditions.find(e => e.id === activeId)?.boundaries;
      if (boundaries && boundaries.length > 0) {
        return phrasesFromBeatIndices(analysis.beats, boundaries, analysis.duration);
      }
    }

    const refIdx = computeReferenceIndex(analysis.beats, analysis.downbeats, offsetBeatIndex, analysis.sections);
    switch (phraseDetectionMode) {
      case 'rule-based':
        return detectPhrasesRuleBased(analysis.beats, refIdx, defaultBeatsPerPhrase, analysis.duration);
      case 'user-marked': {
        const mark = currentTrack ? phraseMarks[currentTrack.id] : undefined;
        return mark != null
          ? detectPhrasesFromUserMark(analysis.beats, refIdx, mark, analysis.duration)
          : detectPhrasesRuleBased(analysis.beats, refIdx, defaultBeatsPerPhrase, analysis.duration);
      }
      case 'server':
        return analysis.phraseBoundaries?.length
          ? phrasesFromBoundaries(analysis.beats, analysis.phraseBoundaries, analysis.duration)
          : detectPhrasesRuleBased(analysis.beats, refIdx, defaultBeatsPerPhrase, analysis.duration);
    }
  }, [analysis, offsetBeatIndex, phraseDetectionMode, defaultBeatsPerPhrase, phraseMarks, currentTrack?.id, trackEditions, draftBoundaries, effectiveAnalysisData]);

  // ─── Beat time offset / BPM override ───
  const beatTimeOffset = currentTrack ? (beatTimeOffsets[currentTrack.id] ?? 0) : 0;
  const bpmOverride = currentTrack ? bpmOverrides[currentTrack.id] : undefined;

  // ─── Effective beats with offset ───
  const effectiveBeats = useMemo(() => {
    const beats = effectiveAnalysisData?.beats ?? analysis?.beats ?? [];
    const offsetSec = beatTimeOffset / 1000;
    if (offsetSec === 0) return beats;
    return beats.map(b => Math.max(0, b + offsetSec));
  }, [effectiveAnalysisData, analysis, beatTimeOffset]);

  const effectiveDownbeats = useMemo(() => {
    const dbs = effectiveAnalysisData?.downbeats ?? analysis?.downbeats ?? [];
    const offsetSec = beatTimeOffset / 1000;
    if (offsetSec === 0) return dbs;
    return dbs.map(b => Math.max(0, b + offsetSec));
  }, [effectiveAnalysisData, analysis, beatTimeOffset]);

  // ─── Count info (stable reference) ───
  const prevCountRef = useRef<CountInfo | null>(null);
  const countInfo = useMemo(() => {
    const effBeats = effectiveBeats.length > 0 ? effectiveBeats : null;
    const effOffset = effectiveAnalysisData?.offsetBeatIndex ?? offsetBeatIndex;
    const raw = effBeats
      ? getPhraseCountInfo(position + lookAheadMs, effBeats, effectiveDownbeats, effOffset, danceStyle, phraseMap)
      : null;
    const prev = prevCountRef.current;
    if (prev && raw && prev.beatIndex === raw.beatIndex && prev.phraseIndex === raw.phraseIndex) {
      return prev;
    }
    prevCountRef.current = raw;
    return raw;
  }, [position, lookAheadMs, effectiveBeats, effectiveDownbeats, offsetBeatIndex, effectiveAnalysisData, danceStyle, phraseMap]);

  // ─── Current BPM (fixed: use analyzed BPM, no real-time calculation) ───
  const currentBpm = useMemo(() => {
    if (bpmOverride) return bpmOverride;
    if (analysis?.bpm) return Math.round(analysis.bpm);
    return null;
  }, [analysis?.bpm, bpmOverride]);

  // ─── Keep screen awake ───
  useEffect(() => {
    if (isPlaying) activateKeepAwakeAsync('playing').catch(() => {});
    else deactivateKeepAwake('playing');
    return () => { deactivateKeepAwake('playing'); };
  }, [isPlaying]);

  // ─── Edition sync: 곡 변경 시 서버 저장 + 새 곡 복원 ───
  const prevTrackIdForSync = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevTrackIdForSync.current;
    prevTrackIdForSync.current = currentTrack?.id ?? null;

    // 이전 곡 에디션 서버 저장
    if (prevId && prevId !== currentTrack?.id) {
      syncAllEditionsForTrack(prevId).catch(() => {});
    }

    // 새 곡 에디션 서버에서 복원
    if (currentTrack?.id && currentTrack.analysis?.fingerprint) {
      restoreEditionsFromServer(currentTrack.id, currentTrack.analysis.fingerprint).catch(() => {});
    }
  }, [currentTrack?.id]);

  // ─── Edition sync: 앱 백그라운드 진입 시 서버 저장 ───
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && currentTrack?.id) {
        syncAllEditionsForTrack(currentTrack.id).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [currentTrack?.id]);

  // ─── Grid handlers ───
  const handleGridTapBeat = useCallback((globalBeatIndex: number) => {
    if (!currentTrack) return;
    setDownbeatOffset(currentTrack.id, globalBeatIndex);
  }, [currentTrack, setDownbeatOffset]);

  const handleReArrangePhrase = useCallback((globalBeatIndex: number) => {
    if (!currentTrack || !analysis || !phraseMap) return;
    const currentBoundaries = phraseMap.phrases.map(p => p.startBeatIndex);
    const phraseIdx = phraseMap.phrases.findIndex(p =>
      globalBeatIndex >= p.startBeatIndex && globalBeatIndex < p.endBeatIndex
    );
    if (phraseIdx < 0) return;
    const offset = globalBeatIndex - phraseMap.phrases[phraseIdx].startBeatIndex;
    if (offset === 0) return;
    const newBoundaries: number[] = [];
    for (let i = 0; i <= phraseIdx; i++) newBoundaries.push(currentBoundaries[i]);
    newBoundaries.push(globalBeatIndex);
    const totalBeats = analysis.beats.length;
    for (let i = phraseIdx + 1; i < currentBoundaries.length; i++) {
      const shifted = currentBoundaries[i] + offset;
      if (shifted < totalBeats) newBoundaries.push(shifted);
    }
    pushUndo(currentTrack.id, currentBoundaries);
    setDraftBoundaries(currentTrack.id, newBoundaries);
  }, [currentTrack, analysis, phraseMap, setDraftBoundaries, pushUndo]);

  const handleReArrangePhraseLocal = useCallback((globalBeatIndex: number) => {
    if (!currentTrack || !analysis || !phraseMap) return;
    const currentBoundaries = phraseMap.phrases.map(p => p.startBeatIndex);
    const phraseIdx = phraseMap.phrases.findIndex(p =>
      globalBeatIndex >= p.startBeatIndex && globalBeatIndex < p.endBeatIndex
    );
    if (phraseIdx < 0) return;
    const offset = globalBeatIndex - phraseMap.phrases[phraseIdx].startBeatIndex;
    if (offset === 0) return;
    // Only split the current phrase — keep all subsequent boundaries unchanged
    const newBoundaries = [...currentBoundaries];
    newBoundaries.splice(phraseIdx + 1, 0, globalBeatIndex);
    pushUndo(currentTrack.id, currentBoundaries);
    setDraftBoundaries(currentTrack.id, newBoundaries);
  }, [currentTrack, analysis, phraseMap, setDraftBoundaries, pushUndo]);

  const handleSplitPhraseHere = useCallback((globalBeatIndex: number) => {
    if (!currentTrack || !analysis || !phraseMap) return;
    const currentBoundaries = phraseMap.phrases.map(p => p.startBeatIndex);
    const before = [...currentBoundaries];
    if (!currentBoundaries.includes(globalBeatIndex)) currentBoundaries.push(globalBeatIndex);
    currentBoundaries.sort((a, b) => a - b);
    pushUndo(currentTrack.id, before);
    setDraftBoundaries(currentTrack.id, currentBoundaries);
  }, [currentTrack, analysis, phraseMap, setDraftBoundaries, pushUndo]);

  const handleMergeWithPrevious = useCallback((globalBeatIndex: number) => {
    if (!currentTrack || !phraseMap) return;
    const currentBoundaries = phraseMap.phrases.map(p => p.startBeatIndex);
    const newBoundaries = currentBoundaries.filter(b => b !== globalBeatIndex);
    pushUndo(currentTrack.id, currentBoundaries);
    setDraftBoundaries(currentTrack.id, newBoundaries);
  }, [currentTrack, phraseMap, setDraftBoundaries, pushUndo]);

  const handleSeekAndPlay = useCallback((beatTimeMs: number) => {
    seekTo(beatTimeMs);
    if (!isPlaying) togglePlay();
  }, [seekTo, isPlaying, togglePlay]);

  const handleSeekOnly = useCallback((beatTimeMs: number) => {
    seekTo(beatTimeMs);
  }, [seekTo]);

  // ─── Cell notes ───
  const currentCellNotes = useMemo(() => {
    if (activeImportedNote) return activeImportedNote.phraseNote.cellNotes;
    if (!currentTrack) return undefined;
    return cellNotes[currentTrack.id];
  }, [currentTrack?.id, cellNotes, activeImportedNote]);

  const currentBeatNote = useMemo(() => {
    if (!currentCellNotes || !countInfo || countInfo.beatIndex < 0) return null;
    return currentCellNotes[String(countInfo.beatIndex)] ?? null;
  }, [currentCellNotes, countInfo?.beatIndex]);

  const handleSetCellNote = useCallback((beatIndex: number, note: string) => {
    if (!currentTrack) return;
    setCellNote(currentTrack.id, beatIndex, note);
  }, [currentTrack, setCellNote]);

  const handleClearCellNote = useCallback((beatIndex: number) => {
    if (!currentTrack) return;
    clearCellNote(currentTrack.id, beatIndex);
  }, [currentTrack, clearCellNote]);

  // ─── Skip (phrase-based) ───
  const lastBackTapRef = useRef<number>(0);
  const handleSkipBack = useCallback(() => {
    if (!phraseMap || !countInfo || !analysis) {
      seekTo(Math.max(0, position - 10000));
      return;
    }
    const now = Date.now();
    const isDoubleTap = now - lastBackTapRef.current < 400;
    lastBackTapRef.current = now;
    const idx = countInfo.phraseIndex;
    const phrase = phraseMap.phrases[idx];
    if (!phrase) return;
    if (isDoubleTap && idx > 0) seekTo(phraseMap.phrases[idx - 1].startTime * 1000);
    else seekTo(phrase.startTime * 1000);
  }, [phraseMap, countInfo, analysis, position, seekTo]);

  const handleSkipForward = useCallback(() => {
    if (!phraseMap || !countInfo || !analysis) {
      seekTo(Math.min(duration, position + 10000));
      return;
    }
    const nextIdx = countInfo.phraseIndex + 1;
    if (nextIdx < phraseMap.phrases.length) seekTo(phraseMap.phrases[nextIdx].startTime * 1000);
  }, [phraseMap, countInfo, analysis, duration, position, seekTo]);

  // ─── A-B loop ───
  const handleSetLoopPoint = useCallback((beatTimeMs: number) => {
    if (loopStart == null || loopEnd != null) {
      clearLoop();
      setLoopStart(beatTimeMs);
    } else {
      const start = Math.min(loopStart, beatTimeMs);
      const end = Math.max(loopStart, beatTimeMs);
      setLoopStart(start);
      setLoopEnd(end);
    }
  }, [loopStart, loopEnd, setLoopStart, setLoopEnd, clearLoop]);

  // ─── "Now is 1" ───
  const handleNowIsOne = useCallback(() => {
    if (!currentTrack) return;
    if (isYouTube) {
      if (tapBpm <= 0) {
        Alert.alert(t('player.bpmRequired'), t('player.setBpmFirst'));
        return;
      }
      const synth = generateSyntheticAnalysis(tapBpm, duration, position);
      setTrackAnalysis(currentTrack.id, synth);
      const anchorIdx = findNearestBeatIndex(position, synth.beats);
      if (anchorIdx >= 0) setDownbeatOffset(currentTrack.id, anchorIdx);
    } else {
      if (!analysis) return;
      const nearestIdx = findNearestBeatIndex(position, analysis.beats);
      if (nearestIdx >= 0) setDownbeatOffset(currentTrack.id, nearestIdx);
    }
  }, [currentTrack, isYouTube, tapBpm, duration, position, analysis, setTrackAnalysis, setDownbeatOffset]);

  // ─── Analysis trigger (서버 분석) ───
  const runAnalysis = useCallback(async () => {
    if (!currentTrack) return;

    // Ensure file exists before uploading to server
    const validUri = await ensureFileAvailable(currentTrack);
    if (!validUri) {
      Alert.alert(t('playerError.fileNotFound'), t('playerError.fileNotFoundDesc'));
      return;
    }
    if (validUri !== currentTrack.uri) {
      updateTrackData(currentTrack.id, { uri: validUri });
    }

    setTrackAnalysisStatus(currentTrack.id, 'analyzing');

    try {
      const result = await analyzeTrack(
        validUri, currentTrack.title, currentTrack.format,
        (jobId) => setTrackPendingJobId(currentTrack.id, jobId),
      );
      setTrackAnalysis(currentTrack.id, result);

      // Auto-set album art from server metadata (Spotify)
      if (result.metadata?.albumArtUrl && !currentTrack.thumbnailUri) {
        try {
          const artDir = FileSystem.documentDirectory + 'album-art/';
          await FileSystem.makeDirectoryAsync(artDir, { intermediates: true }).catch(() => {});
          const artPath = artDir + currentTrack.id + '.jpg';
          const dl = await FileSystem.downloadAsync(result.metadata.albumArtUrl, artPath);
          if (dl.status === 200) {
            setTrackThumbnail(currentTrack.id, dl.uri);
          }
        } catch (e) {
          // Best-effort — album art is optional
        }
      }

      if (result.phraseBoundaries && result.phraseBoundaries.length > 0) {
        const boundaryBeatIndices = result.phraseBoundaries.map(ts => {
          let closest = 0;
          let minDiff = Math.abs(result.beats[0] - ts);
          for (let i = 1; i < result.beats.length; i++) {
            const diff = Math.abs(result.beats[i] - ts);
            if (diff < minDiff) { minDiff = diff; closest = i; }
          }
          return closest;
        });
        setServerEdition(currentTrack.id, boundaryBeatIndices);
      }
    } catch (e: any) {
      const isBackgroundError = e.message?.includes('aborted') || e.message?.includes('Network request failed');
      if (isBackgroundError && usePlayerStore.getState().tracks.find(t => t.id === currentTrack.id)?.pendingJobId) return;
      setTrackAnalysisStatus(currentTrack.id, 'error');
      setTrackPendingJobId(currentTrack.id, undefined);
      Alert.alert(t('player.analysisFailed'), e.message || 'Analysis failed.');
    }
  }, [currentTrack, setTrackAnalysisStatus, setTrackAnalysis, setTrackPendingJobId, setServerEdition, updateTrackData]);

  // ─── Edition / Import ───
  const activeSource = useMemo((): string => {
    if (activeImportedNote) return `imported-${activeImportedNote.id}`;
    return 'mine';
  }, [activeImportedNote]);

  const handleSelectMine = useCallback(() => {
    if (!currentTrack) return;
    setActiveImportedNote(currentTrack.id, null);
  }, [currentTrack, setActiveImportedNote]);

  const handleSelectImported = useCallback((noteId: string) => {
    if (!currentTrack) return;
    setActiveImportedNote(currentTrack.id, noteId);
  }, [currentTrack, setActiveImportedNote]);

  const handleDeleteImported = useCallback((noteId: string) => {
    Alert.alert(t('player.deleteImportedNote'), t('player.cannotBeUndone'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeImportedNote(noteId) },
    ]);
  }, [removeImportedNote]);

  const handleImportPhraseNote = useCallback(async () => {
    try {
      // Delay to let settings modal fully close before opening document picker
      await new Promise(r => setTimeout(r, 400));
      const pnote = await pickPhraseNoteFile();
      if (!pnote) return;
      const tracksWithAnalysis = tracks.filter(t => t.analysis).map(t => ({ id: t.id, analysis: t.analysis! }));
      let matchedTrackId = findMatchingTrack(tracksWithAnalysis, pnote);
      if (!matchedTrackId && currentTrack) {
        await new Promise<void>((resolve) => {
          Alert.alert(t('playerError.noMatchingTrack'),
            t('playerError.applyNotesConfirm', { author: pnote.metadata.author, track: currentTrack.title }),
            [
              { text: t('common.cancel'), style: 'cancel', onPress: () => resolve() },
              { text: t('common.confirm'), onPress: () => { matchedTrackId = currentTrack.id; resolve(); } },
            ]);
        });
      }
      if (!matchedTrackId) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setActiveImportedNote(matchedTrackId, null);
      addImportedNote({ id, trackId: matchedTrackId, phraseNote: pnote, importedAt: Date.now(), isActive: true });
      Alert.alert(t('player.import'), t('player.importLoaded', { author: pnote.metadata.author }));
    } catch (err: any) {
      Alert.alert(t('player.analysisFailed'), err.message || t('player.importFailed'));
    }
  }, [tracks, currentTrack, addImportedNote, setActiveImportedNote]);

  // ─── Share ───
  const handleSharePhraseNote = useCallback((activeFormationData: any) => {
    if (!currentTrack || !analysis || !phraseMap) return;
    const noteLabel = activeFormationData ? 'ChoreoNote' : 'PhraseNote';
    Alert.alert(t('player.shareTitle', { noteLabel }), t('player.chooseHowToShare'), [
      {
        text: t('player.shareToCrew'),
        onPress: () => {
          const trackId = currentTrack.id;
          const offset = downbeatOffsets[trackId] ?? activeImportedNote?.phraseNote.analysis.downbeatOffset ?? 0;
          const boundaries = phraseMap.phrases.map(p => p.startBeatIndex);
          const notes = cellNotes[trackId] ?? {};
          const pnote = buildPhraseNoteFile({
            author: '', title: currentTrack.title, analysis, danceStyle,
            downbeatOffset: offset, boundaries, beatsPerPhrase: phraseMap.beatsPerPhrase,
            cellNotes: notes, formation: activeFormationData ?? undefined,
          });
          router.push({
            pathname: '/community/share-to-crew',
            params: {
              phraseNoteData: JSON.stringify(pnote),
              songTitle: currentTrack.title,
              bpm: analysis.bpm ? String(Math.round(analysis.bpm)) : '',
              danceStyle,
              noteType: activeFormationData ? 'cnote' : 'pnote',
              fingerprint: analysis.fingerprint || '',
            },
          });
        },
      },
      {
        text: t('player.externalShare'),
        onPress: async () => {
          const trackId = currentTrack.id;
          const offset = downbeatOffsets[trackId] ?? activeImportedNote?.phraseNote.analysis.downbeatOffset ?? 0;
          const boundaries = phraseMap.phrases.map(p => p.startBeatIndex);
          const notes = cellNotes[trackId] ?? {};
          const { useAuthStore } = await import('../stores/authStore');
          const authUser = useAuthStore.getState().user;
          const authorName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Unknown';
          const pnote = buildPhraseNoteFile({
            author: authorName, title: currentTrack.title, analysis, danceStyle,
            downbeatOffset: offset, boundaries, beatsPerPhrase: phraseMap.beatsPerPhrase,
            cellNotes: notes, formation: activeFormationData ?? undefined,
          });
          try { await exportPhraseNote(pnote, currentTrack.title); }
          catch (err: any) {
            if (err?.message !== 'User did not share')
              Alert.alert(t('player.shareError'), err?.message || t('player.failedToShare'));
          }
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [currentTrack, analysis, phraseMap, downbeatOffsets, cellNotes, danceStyle, router, activeImportedNote]);

  // ─── Return ───
  return {
    // State
    currentTrack, isPlaying, position, duration, playbackRate,
    isVideo, isYouTube, isVisual,
    analysis, countInfo, phraseMap, effectiveBeats, effectiveDownbeats, currentBpm,
    beatTimeOffset, bpmOverride,
    loopStart, loopEnd, loopEnabled,
    gridScrollMode, danceStyle,
    currentCellNotes, currentBeatNote,
    activeImportedNote, trackImportedNotes, activeSource,
    canUndo,

    // Players
    audioPlayer, videoPlayer, youtubePlayer,
    tapBpm, tapPhase, recordTap, adjustBpm, resetTapTempo,

    // Actions
    togglePlay, seekTo, setPlaybackRate,
    setIsSeeking,
    toggleGridScrollMode,
    setBeatTimeOffset, setBpmOverride, clearBpmOverride,
    setLoopStart, setLoopEnd, clearLoop,
    setTrackAnalysisStatus, setTrackAnalysis, setTrackPendingJobId,
    setDraftBoundaries, clearDraft, saveDraftAsEdition,
    setServerEdition, setDownbeatOffset,
    runAnalysis,

    // Handlers
    handleGridTapBeat, handleReArrangePhrase, handleReArrangePhraseLocal, handleSplitPhraseHere,
    handleMergeWithPrevious, handleSeekAndPlay, handleSeekOnly,
    handleSetCellNote, handleClearCellNote,
    handleSkipBack, handleSkipForward,
    handleSetLoopPoint, handleNowIsOne,
    handleUndo,
    handleSelectMine, handleSelectImported, handleDeleteImported,
    handleImportPhraseNote, handleSharePhraseNote,
  };
}
