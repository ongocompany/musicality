import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Animated, Modal, TextInput, Keyboard, Pressable, StatusBar, useWindowDimensions, Image, Platform, Dimensions } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { VideoOverlay } from '../../components/ui/VideoOverlay';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { FormationStageView } from '../../components/ui/FormationStageView';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTapTempoStore } from '../../stores/tapTempoStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer';
import { useCuePlayer } from '../../hooks/useCuePlayer';
import { analyzeTrack } from '../../services/analysisApi';
import { buildPhraseNoteFile, exportPhraseNote, pickPhraseNoteFile, findMatchingTrack, validatePhraseNote } from '../../services/phraseNoteService';
import { ImportedPhraseNote } from '../../types/phraseNote';
import { FormationData, StageConfig, createDefaultDancers, STAGE_PRESETS } from '../../types/formation';
import { getPhraseCountInfo, computeReferenceIndex, findNearestBeatIndex, CountInfo } from '../../utils/beatCounter';
import { detectPhrasesRuleBased, detectPhrasesFromUserMark, phrasesFromBoundaries, phrasesFromBeatIndices } from '../../utils/phraseDetector';
import { generateSyntheticAnalysis } from '../../utils/beatGenerator';
import { Colors, Spacing, FontSize, getPhraseColor, blendColors, NoteTypeColors } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ─── Marquee scrolling title ─────────────────────────
function MarqueeTitle({ text, style }: { text: string; style: any }) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const overflow = textW - containerW;

  useEffect(() => {
    if (animRef.current) animRef.current.stop();
    scrollAnim.setValue(0);
    if (overflow <= 2) return;
    // Speed: ~30px/sec
    const duration = (overflow / 30) * 1000;
    const loop = () => {
      scrollAnim.setValue(0);
      animRef.current = Animated.sequence([
        Animated.delay(1500),
        Animated.timing(scrollAnim, { toValue: -overflow, duration, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(scrollAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]);
      animRef.current.start(({ finished }) => { if (finished) loop(); });
    };
    loop();
    return () => { if (animRef.current) animRef.current.stop(); };
  }, [overflow, text]);

  return (
    <View
      style={{ flex: 1, overflow: 'hidden', marginRight: Spacing.sm }}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      {/* Hidden text for full-width measurement (no truncation) */}
      <Text
        style={[style, { position: 'absolute', opacity: 0, flex: undefined, width: 9999 }]}
        numberOfLines={1}
        onTextLayout={(e) => {
          const w = e.nativeEvent.lines[0]?.width ?? 0;
          if (Math.abs(w - textW) > 1) setTextW(w);
        }}
      >
        {text}
      </Text>
      {/* Visible scrolling text */}
      <Animated.Text
        style={[style, { flex: undefined, marginRight: undefined, transform: [{ translateX: scrollAnim }] }]}
        numberOfLines={1}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

export default function PlayerScreen() {
  const { t } = useTranslation();
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    playbackRate,
    setPlaybackRate,
    loopEnabled,
    loopStart,
    loopEnd,
    setLoopStart,
    setLoopEnd,
    clearLoop,
    setIsSeeking,
    setTrackAnalysisStatus,
    setTrackAnalysis,
  } = usePlayerStore();

  const videoAspectRatio = usePlayerStore((s) => s.videoAspectRatio);

  const isVideo = currentTrack?.mediaType === 'video';
  const isYouTube = currentTrack?.mediaType === 'youtube';
  const isVisual = isVideo || isYouTube;

  // Screen dimensions (used for fullscreen video sizing)
  const { width: winW, height: winH } = useWindowDimensions();

  const audioPlayer = useAudioPlayer();
  const videoPlayer = useVideoPlayer();
  const youtubePlayer = useYouTubePlayer();

  const togglePlay = isYouTube
    ? youtubePlayer.togglePlay
    : isVideo
      ? videoPlayer.togglePlay
      : audioPlayer.togglePlay;
  const seekTo = isYouTube
    ? youtubePlayer.seekTo
    : isVideo
      ? videoPlayer.seekTo
      : audioPlayer.seekTo;

  useCuePlayer();

  // Tap tempo store (for YouTube inline tap tempo)
  const tapBpm = useTapTempoStore((s) => s.bpm);
  const tapPhase = useTapTempoStore((s) => s.phase);
  const recordTap = useTapTempoStore((s) => s.recordTap);
  const adjustBpm = useTapTempoStore((s) => s.adjustBpm);
  const resetTapTempo = useTapTempoStore((s) => s.reset);

  const danceStyle = useSettingsStore((s) => s.danceStyle);
  const cueEnabled = useSettingsStore((s) => s.cueEnabled);
  const toggleCue = useSettingsStore((s) => s.toggleCue);
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
  // Formation state
  const trackFormations = useSettingsStore((s) => s.trackFormations);
  const setDraftFormation = useSettingsStore((s) => s.setDraftFormation);
  const draftFormation = useSettingsStore((s) => s.draftFormation);
  const saveFormationDraftAsEdition = useSettingsStore((s) => s.saveFormationDraftAsEdition);
  const clearFormationDraft = useSettingsStore((s) => s.clearFormationDraft);
  const stageConfig = useSettingsStore((s) => s.stageConfig);
  const setStageConfig = useSettingsStore((s) => s.setStageConfig);

  const tracks = usePlayerStore((s) => s.tracks);

  const onYtStateChange = useCallback((state: string) => {
    youtubePlayer.onStateChange(state);
  }, []);

  // Force YoutubePlayer remount after fullscreen exit to fix Android touch capture bug
  const [ytMountKey, setYtMountKey] = useState(0);
  const ytSavedTimeRef = useRef(0);
  const onYtFullScreenChange = useCallback((isFullScreen: boolean) => {
    if (!isFullScreen) {
      // Save current position before remount
      ytSavedTimeRef.current = usePlayerStore.getState().position;
      setYtMountKey(k => k + 1);
    }
  }, []);

  // ─── Fullscreen video mode ───
  const [isFullScreen, setIsFullScreen] = useState(false);

  const fullscreenVideoRef = useRef<Video>(null);
  const savedPositionRef = useRef(0);

  const enterFullScreen = useCallback(async () => {
    // Save current position and pause main player
    savedPositionRef.current = usePlayerStore.getState().position;
    if (isVideo && videoPlayer.videoRef.current) {
      await videoPlayer.videoRef.current.pauseAsync().catch(() => {});
    }
    setIsFullScreen(true);
    const isLandscape = videoAspectRatio >= 1.0;
    await ScreenOrientation.lockAsync(
      isLandscape
        ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP
    );
  }, [videoAspectRatio]);

  const exitFullScreen = useCallback(async () => {
    // Capture fullscreen state before closing
    let wasPlaying = false;
    if (isVideo && fullscreenVideoRef.current) {
      try {
        const status = await fullscreenVideoRef.current.getStatusAsync();
        if (status.isLoaded) {
          wasPlaying = status.isPlaying;
          savedPositionRef.current = status.positionMillis;
          await fullscreenVideoRef.current.pauseAsync();
        }
      } catch {}
    }
    // Store play intent and position for main video to restore after remount
    usePlayerStore.getState().setIsPlaying(wasPlaying);
    usePlayerStore.getState().setPosition(savedPositionRef.current);
    setIsFullScreen(false);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, [isVideo, videoPlayer]);

  // When fullscreen video mounts, seek to saved position
  const onFullscreenVideoLoad = useCallback(async (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    try {
      await fullscreenVideoRef.current?.setPositionAsync(savedPositionRef.current);
    } catch {}
  }, []);

  // Fullscreen video status → update store position so counter works
  const onFullscreenPlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const store = usePlayerStore.getState();
    if (!store.isSeeking) {
      store.setPosition(status.positionMillis);
    }
    if (status.durationMillis) {
      store.setDuration(status.durationMillis);
    }
    if (status.didJustFinish) {
      store.setIsPlaying(false);
    }
  }, []);

  // Keep screen awake while playing (sync + tag for Android reliability)
  useEffect(() => {
    if (isPlaying) {
      activateKeepAwake('playing');
    } else {
      deactivateKeepAwake('playing');
    }
    return () => { deactivateKeepAwake('playing'); };
  }, [isPlaying]);

  // When main video remounts after fullscreen exit, restore position & play state
  const fullscreenJustExitedRef = useRef(false);
  useEffect(() => {
    if (!isFullScreen) {
      fullscreenJustExitedRef.current = true;
    }
  }, [isFullScreen]);

  const onMainVideoLoad = useCallback(async (status: AVPlaybackStatus) => {
    if (!status.isLoaded || !fullscreenJustExitedRef.current) return;
    fullscreenJustExitedRef.current = false;
    try {
      await videoPlayer.videoRef.current?.setPositionAsync(savedPositionRef.current);
      if (usePlayerStore.getState().isPlaying) {
        await videoPlayer.videoRef.current?.playAsync();
      }
    } catch {}
  }, [videoPlayer]);

  // Restore portrait on unmount
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const analysis = currentTrack?.analysis;
  const offsetBeatIndex = currentTrack ? (downbeatOffsets[currentTrack.id] ?? null) : null;

  // ─── Imported notes for current track ───
  const trackImportedNotes = useMemo(() => {
    if (!currentTrack) return [];
    return importedNotes.filter(n => n.trackId === currentTrack.id);
  }, [currentTrack?.id, importedNotes]);

  const activeImportedNote = useMemo(() => {
    return trackImportedNotes.find(n => n.isActive) ?? null;
  }, [trackImportedNotes]);

  // ─── Effective beats/analysis: use imported data when active ───
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

  const phraseMap = useMemo(() => {
    // ─── Imported PhraseNote active → use its boundaries ───
    if (effectiveAnalysisData?.isImported) {
      const { beats, boundaries, duration } = effectiveAnalysisData;
      if (beats.length > 0 && boundaries.length > 0) {
        return phrasesFromBeatIndices(beats, boundaries, duration);
      }
    }

    if (!analysis || !analysis.beats || analysis.beats.length === 0) return undefined;

    // ─── Draft boundaries (unsaved edits) take highest priority ───
    const draft = currentTrack ? draftBoundaries[currentTrack.id] : undefined;
    if (draft && draft.length > 0) {
      return phrasesFromBeatIndices(analysis.beats, draft, analysis.duration);
    }

    // ─── Active edition boundaries ───
    const editions = currentTrack ? trackEditions[currentTrack.id] : undefined;
    if (editions) {
      const activeId = editions.activeEditionId;
      let boundaries: number[] | undefined;
      if (activeId === 'S') {
        boundaries = editions.server?.boundaries;
      } else {
        const userEd = editions.userEditions.find(e => e.id === activeId);
        boundaries = userEd?.boundaries;
      }
      if (boundaries && boundaries.length > 0) {
        return phrasesFromBeatIndices(analysis.beats, boundaries, analysis.duration);
      }
    }

    // Fallback: detection mode
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

  // ─── Beat time offset + BPM override (per-track, immediate) ───
  const beatTimeOffset = currentTrack ? (beatTimeOffsets[currentTrack.id] ?? 0) : 0;
  const bpmOverride = currentTrack ? bpmOverrides[currentTrack.id] : undefined;
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInputValue, setBpmInputValue] = useState('');

  // ─── Effective beats/downbeats with timing offset applied ───
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

  // Stable countInfo — only update reference when beatIndex/phraseIndex actually change
  // This prevents PhraseGrid re-renders on every 50ms position tick
  const prevCountRef = useRef<CountInfo | null>(null);
  const countInfo = useMemo(() => {
    // Use offset-applied beats
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

  // ─── Instantaneous BPM at current position ───
  const currentBpm = useMemo(() => {
    if (!effectiveBeats.length || !countInfo || countInfo.beatIndex < 0) return null;
    const idx = countInfo.beatIndex;
    // Average over a few beats around current position for stability
    const windowSize = 4;
    const start = Math.max(0, idx - windowSize);
    const end = Math.min(effectiveBeats.length - 1, idx + windowSize);
    if (end <= start) return null;
    const interval = (effectiveBeats[end] - effectiveBeats[start]) / (end - start);
    if (interval <= 0) return null;
    return Math.round(60 / interval);
  }, [effectiveBeats, countInfo?.beatIndex]);

  // Bounce animation for count number
  const countBounceAnim = useRef(new Animated.Value(1)).current;
  const prevCountNumRef = useRef<number | null>(null);
  useEffect(() => {
    if (countInfo && countInfo.count !== prevCountNumRef.current) {
      prevCountNumRef.current = countInfo.count;
      countBounceAnim.setValue(1.3);
      Animated.spring(countBounceAnim, {
        toValue: 1,
        friction: 4,
        tension: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [countInfo?.count]);

  const handleGridTapBeat = useCallback((globalBeatIndex: number) => {
    if (!currentTrack) return;
    setDownbeatOffset(currentTrack.id, globalBeatIndex);
  }, [currentTrack, setDownbeatOffset]);

  // Re-arrange phrases: split here and shift all subsequent boundaries by the offset
  // e.g. [0,32,64,96] re-arrange at beat 40 → offset=8 → [0,32,40,72,104]
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
    // Keep boundaries up to and including the current phrase start
    for (let i = 0; i <= phraseIdx; i++) {
      newBoundaries.push(currentBoundaries[i]);
    }
    // Add the split point
    newBoundaries.push(globalBeatIndex);
    // Shift all subsequent boundaries by offset
    const totalBeats = analysis.beats.length;
    for (let i = phraseIdx + 1; i < currentBoundaries.length; i++) {
      const shifted = currentBoundaries[i] + offset;
      if (shifted < totalBeats) newBoundaries.push(shifted);
    }
    pushUndo(currentTrack.id, currentBoundaries);
    setDraftBoundaries(currentTrack.id, newBoundaries);
  }, [currentTrack, analysis, phraseMap, setDraftBoundaries, pushUndo]);

  // Paused tap: seek to beat and start playback (preview)
  const handleSeekAndPlay = useCallback((beatTimeMs: number) => {
    seekTo(beatTimeMs);
    if (!isPlaying) togglePlay();
  }, [seekTo, isPlaying, togglePlay]);

  // Seek only (no play) — for paused cell tap to preview position
  const handleSeekOnly = useCallback((beatTimeMs: number) => {
    seekTo(beatTimeMs);
  }, [seekTo]);

  // Split phrase: add boundary but keep original phrase boundary intact
  // Unlike "Start new phrase here", this preserves the front part as its own phrase
  const handleSplitPhraseHere = useCallback((globalBeatIndex: number) => {
    if (!currentTrack || !analysis || !phraseMap) return;
    const currentBoundaries = phraseMap.phrases.map(p => p.startBeatIndex);
    const before = phraseMap.phrases.map(p => p.startBeatIndex);
    if (!currentBoundaries.includes(globalBeatIndex)) {
      currentBoundaries.push(globalBeatIndex);
    }
    currentBoundaries.sort((a, b) => a - b);
    pushUndo(currentTrack.id, before);
    setDraftBoundaries(currentTrack.id, currentBoundaries);
  }, [currentTrack, analysis, phraseMap, setDraftBoundaries, pushUndo]);

  // Merge: remove phrase boundary to merge with previous phrase
  const handleMergeWithPrevious = useCallback((globalBeatIndex: number) => {
    if (!currentTrack || !phraseMap) return;
    const currentBoundaries = phraseMap.phrases.map(p => p.startBeatIndex);
    // Remove this boundary (keep the first boundary at index 0 always)
    const newBoundaries = currentBoundaries.filter(b => b !== globalBeatIndex);
    pushUndo(currentTrack.id, currentBoundaries);
    setDraftBoundaries(currentTrack.id, newBoundaries);
  }, [currentTrack, phraseMap, setDraftBoundaries, pushUndo]);


  // ─── Cell notes for current track (use imported notes when active) ───
  const currentCellNotes = useMemo(() => {
    if (activeImportedNote) {
      return activeImportedNote.phraseNote.cellNotes;
    }
    if (!currentTrack) return undefined;
    return cellNotes[currentTrack.id];
  }, [currentTrack?.id, cellNotes, activeImportedNote]);

  // Current beat's note (for persistent banner during playback)
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

  // ─── PhraseNote share ───
  const [shareModalVisible, setShareModalVisible] = useState(false);

  // Edit mode toggle (none / note / formation)
  const [editMode, setEditMode] = useState<'none' | 'note' | 'formation'>('none');

  // Formation editor beat index (synced with playback when not editing)
  const [formationEditBeatIndex, setFormationEditBeatIndex] = useState(0);

  // Active formation data for current track
  const activeFormationData = useMemo((): FormationData | null => {
    if (!currentTrack) return null;
    // Check draft first
    const draft = draftFormation[currentTrack.id];
    if (draft) return draft;
    // Then check track formations
    const tf = trackFormations[currentTrack.id];
    if (!tf) return null;
    const activeId = tf.activeEditionId;
    if (activeId === 'S') return tf.server?.data ?? null;
    const userEd = tf.userEditions.find((e) => e.id === activeId);
    return userEd?.data ?? tf.server?.data ?? null;
  }, [currentTrack, trackFormations, draftFormation]);

  const handleEditFormation = useCallback((beatIndex: number) => {
    setFormationEditBeatIndex(beatIndex);
    // Also seek to the beat so stage and playback are synced
    if (effectiveBeats[beatIndex] != null) {
      seekTo(effectiveBeats[beatIndex] * 1000);
    }
  }, [effectiveBeats, seekTo]);

  // Formation undo stack
  const formationUndoRef = useRef<Record<string, FormationData[]>>({});

  const handleFormationUpdate = useCallback((data: FormationData) => {
    if (!currentTrack) return;
    // Push current state to undo stack before updating
    const current = draftFormation[currentTrack.id];
    if (current) {
      if (!formationUndoRef.current[currentTrack.id]) formationUndoRef.current[currentTrack.id] = [];
      const stack = formationUndoRef.current[currentTrack.id];
      stack.push(current);
      if (stack.length > 30) stack.shift(); // limit stack size
    }
    setDraftFormation(currentTrack.id, data);
  }, [currentTrack, setDraftFormation, draftFormation]);

  const handleFormationUndo = useCallback(() => {
    if (!currentTrack) return;
    const stack = formationUndoRef.current[currentTrack.id];
    if (!stack || stack.length === 0) return;
    const prev = stack.pop()!;
    setDraftFormation(currentTrack.id, prev);
  }, [currentTrack, setDraftFormation]);

  const canUndoFormation = currentTrack ? (formationUndoRef.current[currentTrack.id]?.length ?? 0) > 0 : false;

  const handleCopyPrevKeyframe = useCallback((beatIndex: number) => {
    if (!activeFormationData) return;
    const { copyKeyframe } = require('../../utils/formationInterpolator');
    // Find closest previous keyframe
    const prev = activeFormationData.keyframes
      .filter((kf: any) => kf.beatIndex < beatIndex)
      .sort((a: any, b: any) => b.beatIndex - a.beatIndex)[0];
    if (prev) {
      handleFormationUpdate(copyKeyframe(activeFormationData, prev.beatIndex, beatIndex));
    }
  }, [activeFormationData, handleFormationUpdate]);

  const handleDissolveKeyframe = useCallback((beatIndex: number) => {
    if (!activeFormationData) return;
    const { copyKeyframe } = require('../../utils/formationInterpolator');
    // Find closest previous keyframe
    const prev = activeFormationData.keyframes
      .filter((kf: any) => kf.beatIndex < beatIndex)
      .sort((a: any, b: any) => b.beatIndex - a.beatIndex)[0];
    if (!prev) return;
    // Copy prev keyframe to 4 beats BEFORE current position
    const targetBeat = Math.max(0, beatIndex - 4);
    if (targetBeat <= prev.beatIndex) return; // no room for dissolve
    handleFormationUpdate(copyKeyframe(activeFormationData, prev.beatIndex, targetBeat));
  }, [activeFormationData, handleFormationUpdate]);

  const handleFormationBeatChange = useCallback((beatIndex: number) => {
    setFormationEditBeatIndex(beatIndex);
    // Seek to the beat when navigating in edit mode
    if (effectiveBeats[beatIndex] != null) {
      seekTo(effectiveBeats[beatIndex] * 1000);
    }
  }, [effectiveBeats, seekTo]);

  // Sync formation beat index with playback position
  // Always sync when playing (even in formation edit mode) so dots animate
  useEffect(() => {
    if (!countInfo || countInfo.beatIndex < 0) return;
    if (isPlaying || editMode !== 'formation') {
      setFormationEditBeatIndex(countInfo.beatIndex);
    }
  }, [editMode, countInfo?.beatIndex, isPlaying]);

  // Fractional beat index for smooth formation animation during playback
  // position updates ~50ms → fractional beat changes continuously → smooth interpolation
  const fractionalBeatIndex = useMemo(() => {
    if (!isPlaying || !effectiveBeats || effectiveBeats.length === 0) {
      return formationEditBeatIndex;
    }
    const posSeconds = position / 1000;
    if (posSeconds <= effectiveBeats[0]) return 0;
    const last = effectiveBeats.length - 1;
    if (posSeconds >= effectiveBeats[last]) return last;
    // Binary search for current beat
    let lo = 0, hi = last;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (effectiveBeats[mid] <= posSeconds) lo = mid;
      else hi = mid - 1;
    }
    if (lo >= last) return last;
    const span = effectiveBeats[lo + 1] - effectiveBeats[lo];
    if (span <= 0) return lo;
    const fraction = (posSeconds - effectiveBeats[lo]) / span;
    return lo + Math.max(0, Math.min(1, fraction));
  }, [isPlaying, position, effectiveBeats, formationEditBeatIndex]);

  const handleStageConfigChange = useCallback((config: Partial<StageConfig>) => {
    setStageConfig(config);
  }, [setStageConfig]);

  const [shareAuthorName, setShareAuthorName] = useState('');
  const router = useRouter();

  const handleSharePhraseNote = useCallback(() => {
    if (!currentTrack || !analysis || !phraseMap) return;
    const noteLabel = activeFormationData ? 'ChoreoNote' : 'PhraseNote';
    Alert.alert(t('player.shareTitle', { noteLabel }), t('player.chooseHowToShare'), [
      {
        text: t('player.shareToCrew'),
        onPress: () => {
          const trackId = currentTrack.id;
          const offset = downbeatOffsets[trackId] ?? 0;
          const boundaries = phraseMap.phrases.map(p => p.startBeatIndex);
          const notes = cellNotes[trackId] ?? {};
          const pnote = buildPhraseNoteFile({
            author: '',
            title: currentTrack.title,
            analysis,
            danceStyle,
            downbeatOffset: offset,
            boundaries,
            beatsPerPhrase: phraseMap.beatsPerPhrase,
            cellNotes: notes,
            formation: activeFormationData ?? undefined,
          });
          router.push({
            pathname: '/community/share-to-crew',
            params: {
              phraseNoteData: JSON.stringify(pnote),
              songTitle: currentTrack.title,
              bpm: analysis.bpm ? String(Math.round(analysis.bpm)) : '',
              danceStyle,
              noteType: activeFormationData ? 'cnote' : 'pnote',
            },
          });
        },
      },
      {
        text: t('player.externalShare'),
        onPress: async () => {
          if (!currentTrack || !analysis || !phraseMap) return;
          const trackId = currentTrack.id;
          const offset = downbeatOffsets[trackId] ?? 0;
          const boundaries = phraseMap.phrases.map(p => p.startBeatIndex);
          const notes = cellNotes[trackId] ?? {};
          const { useAuthStore } = await import('../../stores/authStore');
          const authUser = useAuthStore.getState().user;
          const authorName = authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Unknown';
          const pnote = buildPhraseNoteFile({
            author: authorName,
            title: currentTrack.title,
            analysis,
            danceStyle,
            downbeatOffset: offset,
            boundaries,
            beatsPerPhrase: phraseMap.beatsPerPhrase,
            cellNotes: notes,
            formation: activeFormationData ?? undefined,
          });
          try {
            await exportPhraseNote(pnote, currentTrack.title);
          } catch (err: any) {
            if (err?.message !== 'User did not share') {
              Alert.alert(t('player.shareError'), err?.message || t('player.failedToShare'));
            }
          }
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [currentTrack, analysis, phraseMap, downbeatOffsets, cellNotes, danceStyle, router]);

  const handleShareConfirm = useCallback(async () => {
    if (!currentTrack || !analysis || !phraseMap) return;
    // Build pnote data while modal is still visible
    const trackId = currentTrack.id;
    const offset = downbeatOffsets[trackId] ?? 0;
    const boundaries = phraseMap.phrases.map(p => p.startBeatIndex);
    const notes = cellNotes[trackId] ?? {};
    const pnote = buildPhraseNoteFile({
      author: shareAuthorName,
      title: currentTrack.title,
      analysis,
      danceStyle,
      downbeatOffset: offset,
      boundaries,
      beatsPerPhrase: phraseMap.beatsPerPhrase,
      cellNotes: notes,
      formation: activeFormationData ?? undefined,
    });
    // Close modal first, then wait for dismiss animation before opening share sheet
    setShareModalVisible(false);
    await new Promise(resolve => setTimeout(resolve, 400));
    try {
      await exportPhraseNote(pnote, currentTrack.title);
    } catch (err: any) {
      console.warn('[PhraseNote Share]', err?.message || err);
      if (err?.message !== 'User did not share') {
        Alert.alert(t('player.shareError'), err?.message || t('player.failedToSharePhraseNote'));
      }
    }
  }, [currentTrack, analysis, phraseMap, downbeatOffsets, cellNotes, danceStyle, shareAuthorName]);

  // ─── Edition picker active state ───
  // 'source' = 'mine' (original/user editions) or 'imported-{noteId}'
  const activeSource = useMemo((): string => {
    if (activeImportedNote) return `imported-${activeImportedNote.id}`;
    return 'mine';
  }, [activeImportedNote]);

  const handleSelectMine = useCallback(() => {
    if (!currentTrack) return;
    setActiveImportedNote(currentTrack.id, null); // deactivate all imports
  }, [currentTrack, setActiveImportedNote]);

  const handleSelectImported = useCallback((noteId: string) => {
    if (!currentTrack) return;
    setActiveImportedNote(currentTrack.id, noteId);
  }, [currentTrack, setActiveImportedNote]);

  const handleDeleteImported = useCallback((noteId: string) => {
    Alert.alert(t('player.deleteImportedNote'), t('player.cannotBeUndone'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => {
          removeImportedNote(noteId);
        },
      },
    ]);
  }, [removeImportedNote]);

  // ─── Import PhraseNote flow ───
  const handleImportPhraseNote = useCallback(async () => {
    try {
      const pnote = await pickPhraseNoteFile();
      if (!pnote) return; // cancelled

      // Try to auto-match track
      const tracksWithAnalysis = tracks
        .filter(t => t.analysis)
        .map(t => ({ id: t.id, analysis: t.analysis! }));
      let matchedTrackId = findMatchingTrack(tracksWithAnalysis, pnote);

      if (!matchedTrackId && currentTrack) {
        // No auto-match — ask user if they want to apply to current track
        await new Promise<void>((resolve) => {
          Alert.alert(
            'No matching track found',
            `Apply "${pnote.metadata.author}'s notes" to the current track "${currentTrack.title}"?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
              {
                text: 'Apply',
                onPress: () => {
                  matchedTrackId = currentTrack.id;
                  resolve();
                },
              },
            ],
          );
        });
      }

      if (!matchedTrackId) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const imported: ImportedPhraseNote = {
        id,
        trackId: matchedTrackId,
        phraseNote: pnote,
        importedAt: Date.now(),
        isActive: true,
      };

      // Deactivate other imports for this track, then add new
      setActiveImportedNote(matchedTrackId, null);
      addImportedNote(imported);

      Alert.alert(t('player.import'), t('player.importLoaded', { author: pnote.metadata.author }));
    } catch (err: any) {
      Alert.alert(t('player.analysisFailed'), err.message || t('player.importFailed'));
    }
  }, [tracks, currentTrack, addImportedNote, setActiveImportedNote]);

  // Phrase-based skip back (single tap = current phrase start, double tap = previous phrase)
  const lastBackTapRef = useRef<number>(0);
  const handleSkipBack = useCallback(() => {
    if (!phraseMap || !countInfo || !analysis) {
      seekTo(Math.max(0, position - 10000)); // fallback: 10s
      return;
    }
    const now = Date.now();
    const isDoubleTap = now - lastBackTapRef.current < 400;
    lastBackTapRef.current = now;

    const idx = countInfo.phraseIndex;
    const phrase = phraseMap.phrases[idx];
    if (!phrase) return;

    if (isDoubleTap && idx > 0) {
      // Double tap: go to previous phrase start
      seekTo(phraseMap.phrases[idx - 1].startTime * 1000);
    } else {
      // Single tap: go to current phrase start
      seekTo(phrase.startTime * 1000);
    }
  }, [phraseMap, countInfo, analysis, position, seekTo]);

  // Phrase-based skip forward (go to next phrase start)
  const handleSkipForward = useCallback(() => {
    if (!phraseMap || !countInfo || !analysis) {
      seekTo(Math.min(duration, position + 10000)); // fallback: 10s
      return;
    }
    const nextIdx = countInfo.phraseIndex + 1;
    if (nextIdx < phraseMap.phrases.length) {
      seekTo(phraseMap.phrases[nextIdx].startTime * 1000);
    }
  }, [phraseMap, countInfo, analysis, duration, position, seekTo]);

  // A-B loop: alternating A/B point setting from grid long-press
  const handleSetLoopPoint = useCallback((beatTimeMs: number) => {
    if (loopStart == null || loopEnd != null) {
      // No loop or loop complete → start new: set A
      clearLoop();
      setLoopStart(beatTimeMs);
    } else {
      // A is set, B not set → set B (auto-swap if needed)
      const start = Math.min(loopStart, beatTimeMs);
      const end = Math.max(loopStart, beatTimeMs);
      setLoopStart(start);
      setLoopEnd(end);
    }
  }, [loopStart, loopEnd, setLoopStart, setLoopEnd, clearLoop]);

  const handleNowIsOne = () => {
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
  };

  // Analyze mode selection
  const [analyzeMenuVisible, setAnalyzeMenuVisible] = useState(false);
  const [choreoDancerCount, setChoreoDancerCount] = useState(4);

  // Formation setup dialog
  const [formationSetupVisible, setFormationSetupVisible] = useState(false);
  const [setupDancerCount, setSetupDancerCount] = useState(4);
  const [setupStagePresetIdx, setSetupStagePresetIdx] = useState(1); // default 8×4m

  const handleAnalyzePress = () => {
    if (!currentTrack || currentTrack.analysisStatus === 'analyzing') return;
    setAnalyzeMenuVisible(true);
  };

  const runAnalysis = async () => {
    if (!currentTrack) return;
    setAnalyzeMenuVisible(false);

    setTrackAnalysisStatus(currentTrack.id, 'analyzing');
    try {
      const result = await analyzeTrack(currentTrack.uri, currentTrack.title, currentTrack.format);
      setTrackAnalysis(currentTrack.id, result);
      // Store server phrase boundaries as 'S' edition (beat indices)
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
      setTrackAnalysisStatus(currentTrack.id, 'error');
      Alert.alert(t('player.analysisFailed'), e.message || 'Could not connect to analysis server.');
    }
  };

  // ─── Empty state ───────────────────────────────────
  if (!currentTrack) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="disc-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('player.noTrackSelected')}</Text>
          <Text style={styles.emptySubtitle}>{t('player.noTrackHint')}</Text>
        </View>
      </View>
    );
  }

  // ─── Header icon based on media type ───────────────
  const headerIcon = isYouTube ? 'logo-youtube' : isVideo ? 'videocam' : 'musical-notes';
  const headerIconColor = isYouTube ? '#FF0000' : Colors.primary;

  return (
    <View style={styles.container}>
      {/* ─── Scrollable Content ─── */}
      <View style={[styles.scrollArea, isVisual ? styles.videoScrollContent : styles.audioScrollContent]}>

        {/* ① Compact Header (unified for all media types) */}
        <View style={styles.compactHeader}>
          <Ionicons name={headerIcon} size={18} color={headerIconColor} style={{ marginRight: Spacing.xs }} />
          <MarqueeTitle text={currentTrack.title} style={styles.compactTitle} />
          <View style={styles.headerMeta}>
            {analysis && (
              <>
                <TouchableOpacity onPress={toggleGridScrollMode} style={styles.scrollModeBtn}>
                  <Ionicons
                    name={gridScrollMode ? 'swap-vertical' : 'grid-outline'}
                    size={16}
                    color={gridScrollMode ? Colors.primary : Colors.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bpmBadge, bpmOverride != null && { backgroundColor: Colors.tapAccent }]}
                  onPress={() => {
                    setBpmInputValue(String(bpmOverride ?? Math.round(analysis.bpm)));
                    setEditingBpm(true);
                  }}
                >
                  <Text style={styles.bpmText}>
                    {bpmOverride != null
                      ? `${Math.round(bpmOverride)} BPM ✎`
                      : `${currentBpm ?? Math.round(analysis.bpm)} BPM`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSharePhraseNote} style={styles.scrollModeBtn}>
                  <Ionicons name="share-outline" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </>
            )}
            {isYouTube && analysis && (
              <TouchableOpacity
                style={styles.analyzeBtn}
                onPress={() => {
                  setTrackAnalysisStatus(currentTrack.id, 'idle');
                  resetTapTempo();
                }}
              >
                <Ionicons name="refresh" size={16} color={Colors.text} />
                <Text style={styles.analyzeBtnText}>Re-tap</Text>
              </TouchableOpacity>
            )}
            {!isYouTube && currentTrack.analysisStatus === 'done' && (
              <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyzePress}>
                <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
            {!isYouTube && (!currentTrack.analysisStatus || currentTrack.analysisStatus === 'idle' || currentTrack.analysisStatus === 'error') && (
              <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyzePress}>
                <Ionicons name="analytics-outline" size={16} color={Colors.text} />
                <Text style={styles.analyzeBtnText}>{t('player.analyze')}</Text>
              </TouchableOpacity>
            )}
            {!isYouTube && !activeFormationData && (
              <TouchableOpacity style={styles.analyzeBtn} onPress={() => setFormationSetupVisible(true)}>
                <Ionicons name="people-outline" size={16} color={Colors.text} />
                <Text style={styles.analyzeBtnText}>{t('player.formation')}</Text>
              </TouchableOpacity>
            )}
            {currentTrack.analysisStatus === 'analyzing' && (
              <View style={styles.analyzingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.analyzingText}>...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Beat offset fine-tune row */}
        {analysis && (
          <View style={styles.beatOffsetRow}>
            <TouchableOpacity
              style={styles.beatOffsetBtn}
              onPress={() => setBeatTimeOffset(currentTrack.id, beatTimeOffset - 100)}
            >
              <Text style={styles.beatOffsetBtnText}>-100ms</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.beatOffsetCenter, beatTimeOffset !== 0 && { backgroundColor: 'rgba(187,134,252,0.2)' }]}
              onPress={() => setBeatTimeOffset(currentTrack.id, 0)}
            >
              <Text style={[styles.beatOffsetCenterText, beatTimeOffset !== 0 && { color: Colors.primary }]}>
                {beatTimeOffset > 0 ? `+${beatTimeOffset}ms` : beatTimeOffset === 0 ? '0ms' : `${beatTimeOffset}ms`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.beatOffsetBtn}
              onPress={() => setBeatTimeOffset(currentTrack.id, beatTimeOffset + 100)}
            >
              <Text style={styles.beatOffsetBtnText}>+100ms</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* BPM edit modal */}
        {editingBpm && (
          <Modal transparent animationType="fade" onRequestClose={() => setEditingBpm(false)}>
            <Pressable style={styles.bpmModalBackdrop} onPress={() => setEditingBpm(false)}>
              <Pressable style={styles.bpmModalBox} onPress={e => e.stopPropagation()}>
                <Text style={styles.bpmModalTitle}>BPM 수정</Text>
                <TextInput
                  style={styles.bpmModalInput}
                  value={bpmInputValue}
                  onChangeText={setBpmInputValue}
                  keyboardType="numeric"
                  autoFocus
                  selectTextOnFocus
                />
                <View style={styles.bpmModalActions}>
                  <TouchableOpacity onPress={() => { clearBpmOverride(currentTrack.id); setEditingBpm(false); }}>
                    <Text style={styles.bpmModalReset}>초기화</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    const v = parseFloat(bpmInputValue);
                    if (v > 0) setBpmOverride(currentTrack.id, v);
                    setEditingBpm(false);
                  }}>
                    <Text style={styles.bpmModalConfirm}>확인</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {/* ② YouTube Player */}
        {isYouTube && (
          <View style={styles.videoSection}>
            <View style={styles.youtubeContainer}>
              <View>
                <YoutubePlayer
                  key={ytMountKey}
                  ref={youtubePlayer.playerRef}
                  height={200}
                  videoId={currentTrack.uri}
                  play={isPlaying}
                  initialPlayerParams={{
                    start: Math.floor(ytSavedTimeRef.current / 1000),
                    preventFullScreen: true,
                  }}
                  onReady={youtubePlayer.onReady}
                  onChangeState={onYtStateChange}
                  webViewProps={{
                    allowsInlineMediaPlayback: true,
                    injectedJavaScript: `
                      (function(){
                        document.addEventListener('message', function(e) {
                          window.dispatchEvent(new MessageEvent('message', {data: e.data}));
                        });
                      })(); true;
                    `,
                  }}
                />
              </View>
              {analysis && (
                <View style={styles.youtubeOverlay} pointerEvents="none">
                  <VideoOverlay countInfo={countInfo} hasAnalysis={!!analysis} />
                </View>
              )}
              {/* Fullscreen button — disabled for v1, deferred to v2 */}
            </View>

            {/* Analysis done → PhraseGrid */}
            {currentTrack.analysisStatus === 'done' && (
              <View style={styles.videoCountSection}>
                <PhraseGrid
                  countInfo={countInfo}
                  phraseMap={phraseMap ?? null}
                  hasAnalysis={!!analysis}
                  beats={effectiveBeats}
                  isPlaying={isPlaying}
                  onTapBeat={handleGridTapBeat}
                  onReArrangePhrase={handleReArrangePhrase}
                  onSplitPhraseHere={handleSplitPhraseHere}
                  onSetLoopPoint={handleSetLoopPoint}
                  onClearLoop={clearLoop}
                  onSeekAndPlay={handleSeekAndPlay}
                  onSeekOnly={handleSeekOnly}
                  onMergeWithPrevious={handleMergeWithPrevious}
                  loopStart={loopStart}
                  loopEnd={loopEnd}
                  scrollMode={gridScrollMode}
                  cellNotes={currentCellNotes}
                  onSetCellNote={handleSetCellNote}
                  onClearCellNote={handleClearCellNote}
                  currentBeatNote={currentBeatNote}
                  formationData={activeFormationData}
                  onEditFormation={handleEditFormation}
                  editMode={editMode}
                />
              </View>
            )}

            {/* No analysis → Tap Tempo UI */}
            {currentTrack.analysisStatus !== 'done' && (
              <View style={styles.tapTempoSection}>
                {/* Row 1: TAP button + BPM display */}
                <View style={styles.tapTempoRow}>
                  <TouchableOpacity style={styles.tapButton} onPress={recordTap} activeOpacity={0.6}>
                    <Ionicons name="hand-left" size={24} color={Colors.text} />
                    <Text style={styles.tapButtonText}>TAP</Text>
                  </TouchableOpacity>
                  <View style={styles.tapBpmContainer}>
                    <TouchableOpacity onPress={() => adjustBpm(-1)} style={styles.bpmAdjust}>
                      <Ionicons name="remove-circle-outline" size={28} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <Text style={styles.tapBpmValue}>{tapBpm > 0 ? tapBpm : '--'}</Text>
                    <Text style={styles.tapBpmLabel}>BPM</Text>
                    <TouchableOpacity onPress={() => adjustBpm(1)} style={styles.bpmAdjust}>
                      <Ionicons name="add-circle-outline" size={28} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Row 2: "지금이 1" full-width button */}
                <TouchableOpacity
                  style={[styles.nowIsOneButtonWide, tapBpm <= 0 && styles.disabledButton]}
                  onPress={handleNowIsOne}
                  disabled={tapBpm <= 0}
                >
                  <Ionicons name="locate" size={20} color={tapBpm > 0 ? Colors.tapAccent : Colors.textMuted} />
                  <Text style={[styles.nowIsOneTextInline, tapBpm <= 0 && { color: Colors.textMuted }]}>
                    {t('player.nowIsOne')}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.tapTempoHint}>
                  {t('player.tapInstruction')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ② Video Player — hide when fullscreen to avoid dual-instance conflict */}
        {isVideo && !isFullScreen && (
          <View style={styles.videoSection}>
            <View style={[styles.videoContainer, { aspectRatio: videoAspectRatio }]}>
              <Video
                ref={videoPlayer.videoRef}
                source={{ uri: currentTrack.uri }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                progressUpdateIntervalMillis={Platform.OS === 'android' ? 200 : 100}
                onPlaybackStatusUpdate={videoPlayer.onPlaybackStatusUpdate}
                onReadyForDisplay={videoPlayer.onReadyForDisplay}
                onLoad={onMainVideoLoad}
              />
              {currentTrack.analysisStatus === 'done' && (
                <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 10, elevation: 10 }} pointerEvents="none">
                  <VideoOverlay countInfo={countInfo} hasAnalysis={!!analysis} />
                </View>
              )}
            </View>
            {currentTrack.analysisStatus === 'done' && (
              <View style={styles.videoCountSection}>
                <PhraseGrid
                  countInfo={countInfo}
                  phraseMap={phraseMap ?? null}
                  hasAnalysis={!!analysis}
                  beats={effectiveBeats}
                  isPlaying={isPlaying}
                  onTapBeat={handleGridTapBeat}
                  onReArrangePhrase={handleReArrangePhrase}
                  onSplitPhraseHere={handleSplitPhraseHere}
                  onSetLoopPoint={handleSetLoopPoint}
                  onClearLoop={clearLoop}
                  onSeekAndPlay={handleSeekAndPlay}
                  onSeekOnly={handleSeekOnly}
                  onMergeWithPrevious={handleMergeWithPrevious}
                  loopStart={loopStart}
                  loopEnd={loopEnd}
                  scrollMode={gridScrollMode}
                  cellNotes={currentCellNotes}
                  onSetCellNote={handleSetCellNote}
                  onClearCellNote={handleClearCellNote}
                  currentBeatNote={currentBeatNote}
                  formationData={activeFormationData}
                  onEditFormation={handleEditFormation}
                  editMode={editMode}
                />
              </View>
            )}
          </View>
        )}

        {/* ③ Compact Count + PhraseGrid (audio only) */}
        {!isVisual && currentTrack.analysisStatus === 'done' && (
          <View style={styles.countSection}>
            {/* Formation Stage (embedded, shown in formation mode only) */}
            {activeFormationData && editMode === 'formation' ? (
              <View style={{ maxHeight: '56%' }}>
                <FormationStageView
                  formationData={activeFormationData}
                  currentBeatIndex={editMode === 'formation' ? (isPlaying ? fractionalBeatIndex : formationEditBeatIndex) : fractionalBeatIndex}
                  totalBeats={effectiveBeats.length}
                  stageConfig={stageConfig}
                  isPlaying={isPlaying}
                  isEditing={editMode === 'formation'}
                  onUpdate={handleFormationUpdate}
                  onBeatChange={handleFormationBeatChange}
                  onStageConfigChange={handleStageConfigChange}
                  onTogglePlay={togglePlay}
                />
              </View>
            ) : (
              /* Count number with bounce animation (when no formation or note mode) */
              <Animated.Text
                style={[
                  styles.compactCount,
                  {
                    color: countInfo && countInfo.totalPhrases > 0
                      ? (countInfo.isTransitionHint
                        ? blendColors(getPhraseColor(countInfo.phraseIndex), getPhraseColor(countInfo.phraseIndex + 1), 0.5)
                        : getPhraseColor(countInfo.phraseIndex))
                      : Colors.textMuted,
                    transform: [{ scale: countBounceAnim }],
                  },
                ]}
              >
                {countInfo?.count ?? '--'}
              </Animated.Text>
            )}

            {/* PhraseGrid — rhythm game style */}
            <View style={{ flex: 1, width: '100%' }}>
              <PhraseGrid
                countInfo={countInfo}
                phraseMap={phraseMap ?? null}
                hasAnalysis={!!analysis}
                beats={effectiveBeats}
                isPlaying={isPlaying}
                onTapBeat={handleGridTapBeat}
                onReArrangePhrase={handleReArrangePhrase}
                onSplitPhraseHere={handleSplitPhraseHere}
                onSetLoopPoint={handleSetLoopPoint}
                onClearLoop={clearLoop}
                onSeekAndPlay={handleSeekAndPlay}
                onSeekOnly={handleSeekOnly}
                onMergeWithPrevious={handleMergeWithPrevious}
                loopStart={loopStart}
                loopEnd={loopEnd}
                rows={activeFormationData && editMode === 'formation' ? 5 : undefined}
                scrollMode={gridScrollMode}
                cellNotes={currentCellNotes}
                onSetCellNote={handleSetCellNote}
                onClearCellNote={handleClearCellNote}
                currentBeatNote={currentBeatNote}
                formationData={activeFormationData}
                onEditFormation={handleEditFormation}
                onCopyPrevKeyframe={handleCopyPrevKeyframe}
                onDissolveKeyframe={handleDissolveKeyframe}
                editMode={editMode}
              />
            </View>

            {/* ChoreoNote Draft Save/Discard (inside countSection) */}
            {currentTrack && draftFormation[currentTrack.id] && editMode === 'formation' && (
              <View style={[styles.draftActions, { marginTop: 10 }]}>
                <TouchableOpacity
                  style={[styles.draftSaveButton, { borderColor: 'rgba(255, 215, 0, 0.4)', backgroundColor: 'rgba(255, 215, 0, 0.15)', paddingVertical: 4, paddingHorizontal: 12 }]}
                  onPress={() => {
                    const formations = trackFormations[currentTrack.id];
                    const usedSlots = formations?.userEditions?.length ?? 0;
                    if (usedSlots >= 3) {
                      const sorted = [...(formations?.userEditions ?? [])].sort((a, b) => a.createdAt - b.createdAt);
                      const evictId = sorted[0]?.id ?? '1';
                      Alert.alert(
                        t('player.slotsFull'),
                        t('player.allSlotsUsed', { slotId: evictId }),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('player.replaceAndSave'),
                            style: 'destructive',
                            onPress: () => {
                              const slotId = saveFormationDraftAsEdition(currentTrack.id);
                              if (slotId) Alert.alert(t('player.saveEdition'), t('player.editionSaved', { slotId }));
                            },
                          },
                        ],
                      );
                    } else {
                      const slotId = saveFormationDraftAsEdition(currentTrack.id);
                      if (slotId) Alert.alert(t('player.saveEdition'), t('player.editionSaved', { slotId }));
                    }
                  }}
                >
                  <Ionicons name="checkmark-circle" size={18} color={NoteTypeColors.choreoNote} />
                  <Text style={[styles.draftSaveText, { color: NoteTypeColors.choreoNote }]}>{t('common.save')} Ⓒ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.draftUndoButton, !canUndoFormation && { opacity: 0.35 }, { paddingVertical: 4, paddingHorizontal: 12 }]}
                  onPress={handleFormationUndo}
                  disabled={!canUndoFormation}
                >
                  <Ionicons name="arrow-undo-circle" size={18} color={Colors.primary} />
                  <Text style={styles.draftUndoText}>{t('player.undo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.draftDiscardButton, { paddingVertical: 4, paddingHorizontal: 12 }]}
                  onPress={() => {
                    formationUndoRef.current[currentTrack.id] = [];
                    clearFormationDraft(currentTrack.id);
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.error} />
                  <Text style={styles.draftDiscardText}>{t('common.reset')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Draft Save/Discard (PhraseNote — hidden in formation mode) */}
        {currentTrack && draftBoundaries[currentTrack.id] && editMode !== 'formation' && (
          <View style={styles.draftActions}>
            <TouchableOpacity
              style={styles.draftSaveButton}
              onPress={() => {
                const editions = trackEditions[currentTrack.id];
                const usedSlots = editions?.userEditions?.length ?? 0;

                if (usedSlots >= 3) {
                  // 3개 슬롯 꽉 참 → 가장 오래된 슬롯 교체 경고
                  const sorted = [...(editions?.userEditions ?? [])].sort((a, b) => a.createdAt - b.createdAt);
                  const evictId = sorted[0]?.id ?? '1';
                  Alert.alert(
                    t('player.slotsFull'),
                    t('player.allSlotsUsed', { slotId: evictId }),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('player.replaceAndSave'),
                        style: 'destructive',
                        onPress: () => {
                          const slotId = saveDraftAsEdition(currentTrack.id);
                          if (slotId) {
                            Alert.alert(t('player.saveEdition'), t('player.phraseEditionSaved', { slotId }));
                          }
                        },
                      },
                    ],
                  );
                } else {
                  const slotId = saveDraftAsEdition(currentTrack.id);
                  if (slotId) {
                    Alert.alert(t('player.saveEdition'), t('player.phraseEditionSaved', { slotId }));
                  }
                }
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.draftSaveText}>{t('common.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.draftUndoButton, !canUndo && { opacity: 0.35 }]}
              onPress={handleUndo}
              disabled={!canUndo}
            >
              <Ionicons name="arrow-undo-circle" size={20} color={Colors.primary} />
              <Text style={styles.draftUndoText}>{t('player.undo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.draftDiscardButton}
              onPress={() => {
                undoStackRef.current[currentTrack.id] = [];
                clearDraft(currentTrack.id);
              }}
            >
              <Ionicons name="close-circle" size={20} color={Colors.error} />
              <Text style={styles.draftDiscardText}>{t('common.reset')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ⑤ Phrase Timeline (seek + waveform + playhead) */}
        <View style={[styles.seekSection, isVisual && { paddingHorizontal: Spacing.lg }]}>
          {phraseMap && phraseMap.phrases.length > 0 && analysis && (
            <SectionTimeline
              phrases={phraseMap.phrases}
              duration={duration > 0 ? duration / 1000 : analysis.duration}
              currentTimeMs={position}
              waveformPeaks={analysis.waveformPeaks}
              onSeek={seekTo}
              onSeekStart={() => setIsSeeking(true)}
              onSeekEnd={() => setIsSeeking(false)}
              loopStart={loopStart}
              loopEnd={loopEnd}
              loopEnabled={loopEnabled}
            />
          )}
          {/* Fallback: simple progress bar when no analysis */}
          {(!phraseMap || phraseMap.phrases.length === 0 || !analysis) && duration > 0 && (
            <View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(position)}</Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
              <View
                style={styles.fallbackBar}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(evt) => {
                  const x = evt.nativeEvent.locationX;
                  const pct = Math.max(0, Math.min(1, x / (evt.nativeEvent.target ? 300 : 300)));
                  // Use pageX for accuracy
                  evt.currentTarget.measure?.((_x: number, _y: number, w: number, _h: number, pageX: number) => {
                    const relX = evt.nativeEvent.pageX - pageX;
                    const p = Math.max(0, Math.min(1, relX / w));
                    seekTo(Math.round(p * duration));
                  });
                }}
              >
                <View style={[styles.fallbackFill, { width: `${(position / duration) * 100}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* ⑥b Edition Picker (chips: mine + imported notes) */}
        {currentTrack.analysisStatus === 'done' && (trackImportedNotes.length > 0 || analysis) && (
          <View style={styles.editionPickerSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.editionPickerScroll}
            >
              {/* My analysis badges — Ⓟ (PhraseNote, purple) Ⓒ (ChoreoNote, gold) */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4 }}
                onPress={handleSelectMine}
              >
                <Text style={{ fontSize: 20, color: activeSource === 'mine' ? NoteTypeColors.phraseNote : Colors.textMuted }}>
                  Ⓟ
                </Text>
                {activeFormationData && (
                  <Text style={{ fontSize: 20, color: activeSource === 'mine' ? NoteTypeColors.choreoNote : Colors.textMuted, marginLeft: 2 }}>
                    Ⓒ
                  </Text>
                )}
              </TouchableOpacity>

              {/* Imported note chips — avatar with colored border */}
              {trackImportedNotes.map((note) => {
                const isActive = activeSource === `imported-${note.id}`;
                const author = note.phraseNote.metadata.author;
                const initial = author ? author[0].toUpperCase() : '?';
                const isChoreo = note.phraseNote.format === 'cnote';
                const noteColor = isChoreo ? NoteTypeColors.choreoNote : NoteTypeColors.phraseNote;
                return (
                  <TouchableOpacity
                    key={note.id}
                    style={{ alignItems: 'center', marginHorizontal: 4 }}
                    onPress={() => handleSelectImported(note.id)}
                    onLongPress={() => handleDeleteImported(note.id)}
                    delayLongPress={500}
                  >
                    <View style={{
                      width: 34, height: 34, borderRadius: 17,
                      borderWidth: 2,
                      borderColor: isActive ? noteColor : Colors.textMuted,
                      backgroundColor: Colors.surface,
                      justifyContent: 'center', alignItems: 'center',
                      overflow: 'hidden',
                    }}>
                      {note.authorAvatarUrl ? (
                        <Image source={{ uri: note.authorAvatarUrl }} style={{ width: 30, height: 30, borderRadius: 15 }} />
                      ) : (
                        <Text style={{ fontSize: 14, fontWeight: '700', color: isActive ? Colors.text : Colors.textSecondary }}>
                          {initial}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* [+] Import button */}
              <TouchableOpacity
                style={[styles.editionChip, styles.editionChipAdd]}
                onPress={handleImportPhraseNote}
              >
                <Ionicons name="add" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ⑦ Loop A-B inline controls (only visible when loop is being set) */}
        {(loopStart !== null || loopEnd !== null) && (
          <View style={[styles.loopInlineSection, isVisual && { paddingHorizontal: Spacing.lg }]}>
            <View style={styles.loopRow}>
              <TouchableOpacity
                style={[styles.loopButton, loopStart !== null && styles.loopButtonActive]}
                onPress={() => setLoopStart(loopStart !== null ? null : position)}
              >
                <Text style={[styles.loopButtonText, loopStart !== null && styles.loopButtonTextActive]}>
                  A {loopStart !== null ? formatTime(loopStart) : '---'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.loopButton, loopEnd !== null && styles.loopButtonActive]}
                onPress={() => {
                  if (loopEnd !== null) {
                    setLoopEnd(null);
                  } else if (loopStart !== null && position > loopStart) {
                    setLoopEnd(position);
                  }
                }}
              >
                <Text style={[styles.loopButtonText, loopEnd !== null && styles.loopButtonTextActive]}>
                  B {loopEnd !== null ? formatTime(loopEnd) : '---'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.loopClear}
                onPress={clearLoop}
              >
                <Ionicons name="close-circle" size={24} color={Colors.error} />
              </TouchableOpacity>
            </View>
            {loopEnabled && (
              <Text style={styles.loopStatus}>
                {t('player.loop')}: {formatTime(loopStart ?? 0)} - {formatTime(loopEnd ?? 0)}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ─── Fixed Bottom Bar (above tab bar) ─── */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarSide}>
          {currentTrack?.analysisStatus === 'done' && (
            <TouchableOpacity
              onPress={() => setEditMode(editMode === 'note' ? 'none' : 'note')}
              style={styles.editModeToggle}
            >
              <Ionicons
                name={editMode === 'note' ? 'create' : 'create-outline'}
                size={20}
                color={editMode === 'note' ? NoteTypeColors.phraseNote : Colors.textMuted}
              />
            </TouchableOpacity>
          )}
          <SpeedPopup currentRate={playbackRate} rates={RATES} onSelectRate={setPlaybackRate} />
          <TouchableOpacity onPress={handleSkipBack} onLongPress={() => seekTo(0)} delayLongPress={400}>
            <Ionicons name="play-back" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.bottomBarSide}>
          <TouchableOpacity onPress={handleSkipForward}>
            <Ionicons name="play-forward" size={22} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleCue} style={styles.cueToggle}>
            <Ionicons
              name={cueEnabled ? 'volume-high' : 'volume-mute'}
              size={20}
              color={cueEnabled ? Colors.accent : Colors.textMuted}
            />
          </TouchableOpacity>
          {activeFormationData && (
            <TouchableOpacity
              onPress={() => setEditMode(editMode === 'formation' ? 'none' : 'formation')}
              style={styles.editModeToggle}
            >
              <Ionicons
                name={editMode === 'formation' ? 'people' : 'people-outline'}
                size={20}
                color={editMode === 'formation' ? NoteTypeColors.choreoNote : Colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Share PhraseNote — author name modal */}
      <Modal
        visible={shareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setShareModalVisible(false); Keyboard.dismiss(); }}
      >
        <Pressable
          style={styles.shareModalBackdrop}
          onPress={() => { setShareModalVisible(false); Keyboard.dismiss(); }}
        >
          <Pressable style={styles.shareModalContainer} onPress={() => {}}>
            <Text style={styles.shareModalTitle}>{t('player.export')}</Text>
            <Text style={styles.shareModalSubtitle}>{t('player.enterAuthorName')}</Text>
            <TextInput
              style={styles.shareModalInput}
              value={shareAuthorName}
              onChangeText={setShareAuthorName}
              maxLength={30}
              placeholder={t('player.authorNamePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleShareConfirm}
            />
            <View style={styles.shareModalButtons}>
              <TouchableOpacity
                style={styles.shareModalCancel}
                onPress={() => { setShareModalVisible(false); Keyboard.dismiss(); }}
              >
                <Text style={styles.shareModalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareModalShare} onPress={handleShareConfirm}>
                <Ionicons name="share-outline" size={16} color="#FFF" style={{ marginRight: 4 }} />
                <Text style={styles.shareModalShareText}>{t('player.export')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Analyze Mode Selection Modal */}
      <Modal
        visible={analyzeMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAnalyzeMenuVisible(false)}
      >
        <Pressable
          style={styles.shareModalBackdrop}
          onPress={() => setAnalyzeMenuVisible(false)}
        >
          <Pressable style={styles.analyzeMenuContainer} onPress={() => {}}>
            <Text style={styles.analyzeMenuTitle}>{t('player.analyze')}</Text>
            <TouchableOpacity
              style={styles.analyzeMenuOption}
              onPress={() => runAnalysis()}
            >
              <Ionicons name="musical-notes-outline" size={22} color={Colors.primary} />
              <View style={styles.analyzeMenuOptionText}>
                <Text style={styles.analyzeMenuOptionTitle}>PhraseNote</Text>
                <Text style={styles.analyzeMenuOptionDesc}>{t('player.phraseNoteAnalysis')}</Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Formation Setup Dialog */}
      <Modal
        visible={formationSetupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormationSetupVisible(false)}
      >
        <Pressable
          style={styles.shareModalBackdrop}
          onPress={() => setFormationSetupVisible(false)}
        >
          <Pressable style={styles.analyzeMenuContainer} onPress={() => {}}>
            <Text style={styles.analyzeMenuTitle}>{t('player.formation')}</Text>

            {/* Stage size presets */}
            <Text style={[styles.dancerCountLabel, { marginBottom: 8 }]}>{t('player.stageSize')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {STAGE_PRESETS.map((preset, idx) => (
                <TouchableOpacity
                  key={preset.label}
                  style={[
                    styles.stagePresetBtn,
                    setupStagePresetIdx === idx && styles.stagePresetBtnActive,
                  ]}
                  onPress={() => setSetupStagePresetIdx(idx)}
                >
                  <Text style={[
                    styles.stagePresetBtnText,
                    setupStagePresetIdx === idx && styles.stagePresetBtnTextActive,
                  ]}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Dancer count stepper */}
            <View style={styles.dancerCountRow}>
              <Text style={styles.dancerCountLabel}>{t('player.dancers')}</Text>
              <View style={styles.dancerCountStepper}>
                <TouchableOpacity
                  style={styles.dancerCountBtn}
                  onPress={() => setSetupDancerCount(Math.max(2, setupDancerCount - 1))}
                >
                  <Ionicons name="remove" size={18} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.dancerCountValue}>{setupDancerCount}</Text>
                <TouchableOpacity
                  style={styles.dancerCountBtn}
                  onPress={() => setSetupDancerCount(Math.min(12, setupDancerCount + 1))}
                >
                  <Ionicons name="add" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Start button */}
            <TouchableOpacity
              style={[styles.analyzeMenuOption, { backgroundColor: 'rgba(187,134,252,0.15)', borderRadius: 10, marginTop: 8 }]}
              onPress={() => {
                if (!currentTrack) return;
                const preset = STAGE_PRESETS[setupStagePresetIdx];
                setStageConfig(preset.config);
                const dancers = createDefaultDancers(setupDancerCount);
                const emptyFormation: FormationData = {
                  version: 1,
                  dancers,
                  keyframes: [{
                    beatIndex: 0,
                    positions: dancers.map((d, i) => ({
                      dancerId: d.id,
                      x: 0.3 + (i % 2) * 0.4,
                      y: 0.3 + Math.floor(i / 2) * 0.2,
                    })),
                  }],
                };
                setDraftFormation(currentTrack.id, emptyFormation);
                setEditMode('formation');
                setFormationSetupVisible(false);
              }}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
              <View style={styles.analyzeMenuOptionText}>
                <Text style={styles.analyzeMenuOptionTitle}>{t('player.startFormation')}</Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Fullscreen Video Overlay ─── */}
      {isFullScreen && (
        <View style={styles.fullscreenContainer}>
          <StatusBar hidden />
          {/* Native Video — separate instance synced by position */}
          {isVideo && currentTrack && (
            <Video
              ref={fullscreenVideoRef}
              source={{ uri: currentTrack.uri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={isPlaying}
              onLoad={onFullscreenVideoLoad}
              onPlaybackStatusUpdate={onFullscreenPlaybackStatus}
              rate={playbackRate}
              volume={1.0}
            />
          )}
          {/* YouTube — reuse same player via expanding container */}
          {isYouTube && currentTrack && (
            <YoutubePlayer
              ref={youtubePlayer.playerRef}
              height={winH}
              width={winW}
              videoId={currentTrack.uri}
              play={isPlaying}
              onReady={youtubePlayer.onReady}
              onChangeState={onYtStateChange}
              webViewProps={{
                allowsInlineMediaPlayback: true,
                injectedJavaScript: `
                  (function(){
                    document.addEventListener('message', function(e) {
                      window.dispatchEvent(new MessageEvent('message', {data: e.data}));
                    });
                  })(); true;
                `,
              }}
            />
          )}
          {/* Count overlay */}
          {currentTrack?.analysisStatus === 'done' && (
            <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 10 }} pointerEvents="none">
              <VideoOverlay countInfo={countInfo} hasAnalysis={!!analysis} />
            </View>
          )}
          {/* Close button */}
          <TouchableOpacity style={styles.fullscreenCloseBtn} onPress={exitFullScreen}>
            <Ionicons name="contract" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollArea: { flex: 1 },
  audioScrollContent: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.xs },
  videoScrollContent: { flex: 1, paddingHorizontal: 0, paddingBottom: Spacing.md },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '600', marginTop: Spacing.md },
  emptySubtitle: { color: Colors.textSecondary, fontSize: FontSize.md },

  // ─── Compact Header (unified) ───────────────────
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    overflow: 'hidden',
  },
  compactTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
    minWidth: 60,
    marginRight: Spacing.sm,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  scrollModeBtn: {
    padding: 4,
  },
  bpmBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bpmText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700' },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  analyzeBtnText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '600' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  analyzingText: { color: Colors.primary, fontSize: FontSize.xs },

  // ─── Video ──────────────────────────────────────
  videoSection: { flex: 1, alignItems: 'center' },
  videoContainer: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.4,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: { width: '100%', height: '100%' },
  videoCountSection: {
    flex: 1,
    width: '100%',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  youtubeContainer: { width: '100%', backgroundColor: '#000' },
  youtubeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  fullscreenBtn: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    padding: 6,
    zIndex: 20,
  },
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
    zIndex: 200,
  },

  // ─── Count Display + PhraseGrid ─────────────────
  countSection: { flex: 1, alignItems: 'center', marginTop: -10 },
  compactCount: {
    fontSize: 160,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginBottom: Spacing.xs,
  },
  nowIsOneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.tapAccent,
  },
  nowIsOneText: {
    color: Colors.tapAccent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // ─── Tap Tempo (YouTube) ────────────────────────
  tapTempoSection: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: 12,
  },
  tapTempoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  tapButton: {
    width: 64,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapButtonText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  tapBpmContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  bpmAdjust: { padding: Spacing.xs },
  tapBpmValue: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    minWidth: 60,
    textAlign: 'center',
  },
  tapBpmLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  nowIsOneButtonInline: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.tapAccent,
  },
  nowIsOneButtonWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.tapAccent,
    marginTop: Spacing.sm,
  },
  nowIsOneTextInline: {
    color: Colors.tapAccent,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  disabledButton: {
    opacity: 0.4,
    borderColor: Colors.textMuted,
  },
  tapTempoHint: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // ─── Seek / Timeline ───────────────────────────
  seekSection: { marginTop: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  timeText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  fallbackBar: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  fallbackFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },

  // ─── Bottom Bar (fixed above tab bar) ──────────
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bottomBarSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
  },
  cueToggle: {
    padding: Spacing.xs,
  },
  editModeToggle: {
    padding: Spacing.xs,
  },
  analyzeMenuContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    width: 280,
    gap: Spacing.sm,
  },
  analyzeMenuTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  analyzeMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: 10,
  },
  analyzeMenuOptionText: {
    flex: 1,
  },
  analyzeMenuOptionTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  analyzeMenuOptionDesc: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  analyzeMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dancerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  dancerCountLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  dancerCountStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dancerCountBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dancerCountValue: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },

  // ─── Stage preset buttons ──
  stagePresetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  stagePresetBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(187,134,252,0.15)',
  },
  stagePresetBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  stagePresetBtnTextActive: {
    color: Colors.primary,
  },

  // ─── Loop (inline A-B controls in scroll area) ──
  loopInlineSection: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  loopRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  loopButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loopButtonActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceLight },
  loopButtonText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  loopButtonTextActive: { color: Colors.primary },
  loopClear: { padding: Spacing.xs },
  loopStatus: { color: Colors.primary, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.xs },

  // ─── Draft Save/Discard ──────────────────────────
  draftActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 4,
    paddingHorizontal: Spacing.lg,
    marginTop: 2,
  },
  draftSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  draftSaveText: {
    color: '#4CAF50',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  // ─── Beat offset row ────────────────────────────
  beatOffsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
  },
  beatOffsetBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  beatOffsetBtnText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  beatOffsetCenter: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 80,
    alignItems: 'center',
  },
  beatOffsetCenterText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // ─── BPM edit modal ──────────────────────────────
  bpmModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bpmModalBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.xl,
    width: 240,
    gap: Spacing.md,
  },
  bpmModalTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  bpmModalInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  bpmModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  bpmModalReset: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  bpmModalConfirm: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  draftUndoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(187, 134, 252, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(187, 134, 252, 0.4)',
  },
  draftUndoText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  draftDiscardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(207, 102, 121, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(207, 102, 121, 0.4)',
  },
  draftDiscardText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  // Share PhraseNote modal
  shareModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareModalContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    minWidth: 280,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  shareModalTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  shareModalSubtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  shareModalInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    color: Colors.text,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  shareModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  shareModalCancel: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
  },
  shareModalCancelText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  shareModalShare: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  shareModalShareText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // ─── Edition Picker ──────────────────────────────
  editionPickerSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  editionPickerScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingRight: Spacing.md,
  },
  editionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  editionChipActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(187, 134, 252, 0.15)',
  },
  editionChipImported: {
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
  },
  editionChipAdd: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderStyle: 'dashed' as any,
    borderWidth: 1,
    borderColor: Colors.textMuted,
  },
  editionChipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  editionChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
