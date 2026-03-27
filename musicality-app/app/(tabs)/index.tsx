import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Modal, Pressable, AppState, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTutorialStore } from '../../stores/tutorialStore';
import { DEMO_TRACK_ID } from '../../utils/demoTrack';
import { pickMediaFiles, parseYouTubeUrl, createYouTubeTrack } from '../../services/fileImport';
import { analyzeTrack, resumeAnalysisJob, registerCloudTrack } from '../../services/analysisApi';
// Cloud sync disabled — library is local-only
import { Colors, Spacing, FontSize, NoteTypeColors } from '../../constants/theme';
import { Track, MediaType, Folder, SortField } from '../../types/track';
import { TrackEditions } from '../../types/analysis';
import { TrackFormations } from '../../types/formation';

// ─── Helpers ────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MediaTab = 'audio' | 'video' | 'youtube';
const MEDIA_TABS: { key: MediaTab; icon: string }[] = [
  { key: 'audio', icon: 'musical-notes' },
  { key: 'video', icon: 'videocam' },
  { key: 'youtube', icon: 'logo-youtube' },
];

// ─── Sub-components ─────────────────────────────────
function PulsingR({ size = 18 }: { size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.Text style={{ fontSize: size, fontWeight: '900', color: Colors.primary, opacity }}>R</Animated.Text>
  );
}

function AnalysisBadge({ track }: { track: Track }) {
  switch (track.analysisStatus) {
    case 'done':
      return (
        <View style={[styles.badge, styles.badgeDone]}>
          <Text style={styles.badgeText}>{track.analysis?.bpm ? `${Math.round(track.analysis.bpm)} BPM` : 'Analyzed'}</Text>
        </View>
      );
    case 'analyzing':
      return (
        <View style={[styles.badge, styles.badgeAnalyzing]}>
          <Text style={styles.badgeAnalyzingText}>Analyzing...</Text>
        </View>
      );
    case 'error':
      return (
        <View style={[styles.badge, styles.badgeError]}>
          <Ionicons name="alert-circle" size={14} color={Colors.error} />
        </View>
      );
    default:
      return null;
  }
}

function TrackThumbnail({ track }: { track: Track }) {
  if (track.mediaType === 'youtube') {
    return (
      <Image
        source={{ uri: `https://img.youtube.com/vi/${track.uri}/mqdefault.jpg` }}
        style={styles.mediaThumbnail}
      />
    );
  }
  if (track.thumbnailUri) {
    return <Image source={{ uri: track.thumbnailUri }} style={styles.mediaThumbnail} />;
  }
  return (
    <View style={styles.trackIcon}>
      <Ionicons
        name={track.mediaType === 'video' ? 'videocam' : 'musical-notes'}
        size={24}
        color={Colors.primary}
      />
    </View>
  );
}

function EditionIndicators({ editions, hasFormation }: { editions?: TrackEditions; hasFormation?: boolean }) {
  if (!editions) return null;
  const hasServer = !!editions.server;
  if (!hasServer && editions.userEditions.length === 0) return null;

  return (
    <View style={styles.editionIndicators}>
      <Text style={{ fontSize: 14, color: NoteTypeColors.phraseNote }}>Ⓟ</Text>
      {hasFormation && (
        <Text style={{ fontSize: 14, color: NoteTypeColors.choreoNote, marginLeft: 1 }}>Ⓒ</Text>
      )}
    </View>
  );
}

const TrackItem = React.memo(function TrackItem({
  track, editions, hasFormation, isSelected, selectMode, isNowPlaying,
  onPress, onLongPress, onAnalyze, queuePosition,
}: {
  track: Track;
  editions?: TrackEditions;
  hasFormation?: boolean;
  isSelected: boolean;
  selectMode: boolean;
  isNowPlaying: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onAnalyze: () => void;
  queuePosition?: number;  // 1, 2, 3 or undefined
}) {
  const viewRef = useRef<View>(null);
  const isDemoTrack = track.id === DEMO_TRACK_ID;

  // Measure demo track item position for tutorial spotlight
  const handleLayout = useCallback(() => {
    if (!isDemoTrack) return;
    viewRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        useTutorialStore.getState().setElementRect('demoTrackItem', { x, y, width, height });
      }
    });
  }, [isDemoTrack]);

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <View
        ref={isDemoTrack ? viewRef : undefined}
        onLayout={isDemoTrack ? handleLayout : undefined}
        style={[styles.trackItem, isSelected && styles.trackItemSelected, isNowPlaying && styles.trackItemNowPlaying]}
      >
        {selectMode && (
          <View style={[styles.selectCheck, isSelected && styles.selectCheckActive]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </View>
        )}
        <TrackThumbnail track={track} />
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isNowPlaying && { color: Colors.primary }]} numberOfLines={1}>{track.title}</Text>
          <View style={styles.trackMetaRow}>
            <Text style={styles.trackMeta}>
              {track.mediaType === 'youtube' ? 'YouTube' : `${track.format.toUpperCase()} · ${formatFileSize(track.fileSize)}`}
            </Text>
            <AnalysisBadge track={track} />
            <EditionIndicators editions={editions} hasFormation={hasFormation} />
          </View>
        </View>
        {!selectMode && (
          isNowPlaying ? (
            <Ionicons name="volume-high" size={20} color={Colors.primary} />
          ) : track.mediaType !== 'youtube' && track.analysisStatus === 'analyzing' ? (
            <View style={styles.analyzeButton}>
              <PulsingR size={18} />
            </View>
          ) : typeof queuePosition === 'number' ? (
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>{queuePosition}</Text>
            </View>
          ) : track.mediaType !== 'youtube' && (track.analysisStatus === 'idle' || track.analysisStatus === 'error') ? (
            <TouchableOpacity style={styles.analyzeButton} onPress={onAnalyze}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: Colors.primary }}>R</Text>
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          )
        )}
      </View>
    </TouchableOpacity>
  );
});

const SwipeableTrackItem = React.memo(function SwipeableTrackItem({
  track, editions, hasFormation, isSelected, selectMode, isNowPlaying,
  onPlay, onLongPressTrack, onAnalyzeTrack, queuePosition,
  onToggleSelect,
}: {
  track: Track;
  editions?: TrackEditions;
  hasFormation?: boolean;
  isSelected: boolean;
  selectMode: boolean;
  isNowPlaying: boolean;
  onPlay: (track: Track) => void;
  onLongPressTrack: (track: Track) => void;
  onAnalyzeTrack: (track: Track) => void;
  queuePosition?: number;
  onToggleSelect: (trackId: string) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  // 오른쪽 스와이프 에디션 선택 제거 — 플레이어 내 SlotBar로 이동

  // Stable callbacks — only change when track.id changes
  const handlePress = useCallback(() => onPlay(track), [track, onPlay]);
  const handleLongPress = useCallback(() => onLongPressTrack(track), [track, onLongPressTrack]);
  const handleAnalyze = useCallback(() => onAnalyzeTrack(track), [track, onAnalyzeTrack]);

  // Right swipe → visual indicator (selection triggered on open)
  const renderLeftActions = useCallback(() => (
    <View style={styles.swipeSelectBtn}>
      <Ionicons name="checkmark-circle" size={24} color={Colors.accent} />
    </View>
  ), []);

  // Auto-select when right swipe opens, then close immediately
  const handleSwipeOpen = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left') {
      // User swiped right → auto-select
      onToggleSelect(track.id);
      swipeableRef.current?.close();
    }
  }, [track.id, onToggleSelect]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      leftThreshold={40}
      onSwipeableOpen={handleSwipeOpen}
    >
      <TrackItem
        track={track}
        editions={editions}
        hasFormation={hasFormation}
        isSelected={isSelected}
        selectMode={selectMode}
        isNowPlaying={isNowPlaying}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onAnalyze={handleAnalyze}
        queuePosition={queuePosition}
      />
    </Swipeable>
  );
});

const FolderItem = React.memo(function FolderItem({
  folder, trackCount,
  onPress, onLongPress,
}: {
  folder: Folder;
  trackCount: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.folderItem} onPress={onPress} onLongPress={onLongPress}>
      <Ionicons name="folder" size={22} color={Colors.warning} />
      <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
      <Text style={styles.folderCount}>{trackCount}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
});

// ─── Main Screen ────────────────────────────────────
export default function LibraryScreen() {
  // Data selectors — only re-render when these specific values change
  const tracks = usePlayerStore(s => s.tracks);
  const folders = usePlayerStore(s => s.folders);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const sortBy = usePlayerStore(s => s.sortBy);
  const sortOrder = usePlayerStore(s => s.sortOrder);
  // Action selectors — functions never change, no re-render
  const addTrack = usePlayerStore(s => s.addTrack);
  const removeTrack = usePlayerStore(s => s.removeTrack);
  const renameTrack = usePlayerStore(s => s.renameTrack);
  const setCurrentTrack = usePlayerStore(s => s.setCurrentTrack);
  const setTrackAnalysisStatus = usePlayerStore(s => s.setTrackAnalysisStatus);
  const setTrackAnalysis = usePlayerStore(s => s.setTrackAnalysis);
  const setTrackPendingJobId = usePlayerStore(s => s.setTrackPendingJobId);
  const createFolder = usePlayerStore(s => s.createFolder);
  const renameFolder = usePlayerStore(s => s.renameFolder);
  const deleteFolder = usePlayerStore(s => s.deleteFolder);
  const moveTracksToFolder = usePlayerStore(s => s.moveTracksToFolder);
  const setSortBy = usePlayerStore(s => s.setSortBy);
  const setSortOrder = usePlayerStore(s => s.setSortOrder);
  const trackEditions = useSettingsStore((s) => s.trackEditions);
  const setServerEdition = useSettingsStore((s) => s.setServerEdition);
  const setServerFormation = useSettingsStore((s) => s.setServerFormation);
  const trackFormations = useSettingsStore((s) => s.trackFormations);
  const danceStyle = useSettingsStore((s) => s.danceStyle);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const sortLabels: Record<SortField, string> = {
    importedAt: t('library.sortLatest'),
    title: t('library.sortName'),
    bpm: t('library.sortBpm'),
    duration: t('library.sortDuration'),
  };

  const mediaTabs = [
    { key: 'audio' as MediaTab, label: t('library.audio'), icon: 'musical-notes' },
    { key: 'video' as MediaTab, label: t('library.video'), icon: 'videocam' },
    { key: 'youtube' as MediaTab, label: t('library.youtube'), icon: 'logo-youtube' },
  ];

  // Local UI state
  const [activeTab, setActiveTab] = useState<MediaTab>('audio');
  const [showYouTubeInput, setShowYouTubeInput] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const selectMode = selectedTracks.size > 0;
  const [analyzeMenuVisible, setAnalyzeMenuVisible] = useState(false);
  const [analyzeTarget, setAnalyzeTarget] = useState<Track | null>(null);
  const [choreoDancerCount, setChoreoDancerCount] = useState(4);
  const [searchQuery, setSearchQuery] = useState('');

  // Track long-press action sheet (custom modal, replaces Alert.alert for cross-platform)
  const [actionSheetTrack, setActionSheetTrack] = useState<Track | null>(null);

  // Text input prompt (cross-platform replacement for Alert.prompt)
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [promptCallback, setPromptCallback] = useState<((value: string) => void) | null>(null);

  const showPrompt = useCallback((title: string, defaultValue: string, onSubmit: (value: string) => void) => {
    setPromptTitle(title);
    setPromptValue(defaultValue);
    setPromptCallback(() => onSubmit);
    setPromptVisible(true);
  }, []);

  // ─── Sort logic ───────────────────────────────────
  const sortTracks = useCallback((list: Track[]) => {
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'bpm': {
          const aBpm = a.analysis?.bpm ?? 0;
          const bBpm = b.analysis?.bpm ?? 0;
          return aBpm - bBpm;
        }
        case 'duration': {
          const aDur = a.duration ?? 0;
          const bDur = b.duration ?? 0;
          return aDur - bDur;
        }
        case 'importedAt':
        default:
          return a.importedAt - b.importedAt;
      }
    });
    return sortOrder === 'desc' ? sorted.reverse() : sorted;
  }, [sortBy, sortOrder]);

  // ─── Filtered + grouped data ──────────────────────
  const { folderTrackCounts, displayTracks, tabTrackCount } = useMemo(() => {
    const tabTracks = tracks.filter(t => t.mediaType === activeTab);
    const sorted = sortTracks(tabTracks);

    // Count tracks per folder (for folder badges)
    const fCounts = new Map<string, number>();
    for (const t of sorted) {
      if (t.folderId) fCounts.set(t.folderId, (fCounts.get(t.folderId) ?? 0) + 1);
    }

    // Determine which tracks to display
    let display: Track[];
    if (currentFolderId) {
      // Inside a folder: show only that folder's tracks
      display = sorted.filter(t => t.folderId === currentFolderId);
    } else {
      // Root view: show only root (uncategorized) tracks
      display = sorted.filter(t => !t.folderId);
    }

    // Count per tab for badges
    const counts: Record<MediaTab, number> = { audio: 0, video: 0, youtube: 0 };
    for (const t of tracks) counts[t.mediaType]++;

    return { folderTrackCounts: fCounts, displayTracks: display, tabTrackCount: counts };
  }, [tracks, activeTab, sortTracks, folders, currentFolderId]);

  // ─── Build flat list data ─────────────────────────
  type ListItem =
    | { type: 'folder'; folder: Folder; trackCount: number }
    | { type: 'track'; track: Track };

  const listData = useMemo(() => {
    const items: ListItem[] = [];
    if (!currentFolderId) {
      // Root view: show folders belonging to the current tab
      for (const f of folders) {
        if (f.mediaType === activeTab) {
          const count = folderTrackCounts.get(f.id) ?? 0;
          items.push({ type: 'folder', folder: f, trackCount: count });
        }
      }
    }
    for (const t of displayTracks) items.push({ type: 'track', track: t });
    return items;
  }, [folders, displayTracks, folderTrackCounts, currentFolderId, activeTab]);

  // ─── Search filter ─────────────────────────────────
  const filteredListData = useMemo(() => {
    if (!searchQuery.trim()) return listData;
    const q = searchQuery.trim().toLowerCase();
    return listData.filter(item => {
      if (item.type === 'folder') return item.folder.name.toLowerCase().includes(q);
      return item.track.title.toLowerCase().includes(q) ||
        (item.track.artist?.toLowerCase().includes(q));
    });
  }, [listData, searchQuery]);

  // ─── Handlers ─────────────────────────────────────
  const MAX_IMPORT_FILES = 10;
  const importingRef = useRef(false);
  const handleImport = async () => {
    if (importingRef.current) return;
    importingRef.current = true;
    try {
      const filterType = activeTab === 'youtube' ? undefined : activeTab;
      const imported = await pickMediaFiles(filterType);
      if (imported.length > MAX_IMPORT_FILES) {
        Alert.alert(
          t('library.importLimitTitle'),
          t('library.importLimitMsg', { max: MAX_IMPORT_FILES }),
        );
        // Add only first 10
        for (const track of imported.slice(0, MAX_IMPORT_FILES)) {
          addTrack(track);
        }
      } else {
        for (const track of imported) {
          addTrack(track);
        }
      }
    } finally {
      importingRef.current = false;
    }
  };

  const handleAddButton = () => {
    if (activeTab === 'youtube') {
      setShowYouTubeInput(true);
    } else {
      handleImport();
    }
  };

  const handleAddYouTube = () => {
    const videoId = parseYouTubeUrl(youtubeUrl);
    if (!videoId) {
      Alert.alert(t('library.invalidUrl'), t('library.invalidUrlMsg'));
      return;
    }
    const track = createYouTubeTrack(videoId);
    addTrack(track);
    setYoutubeUrl('');
    setShowYouTubeInput(false);
  };

  // FIX: FlatList item.track may hold a stale snapshot (e.g. analysis: undefined)
  // even after setTrackAnalysis() updated the store's tracks array.
  // The analysis-complete icon shows correctly (component subscribes to store directly),
  // but tapping the stale item.track would set currentTrack WITHOUT analysis data → empty player screen.
  // Solution: always fetch the latest track from the store by ID before setting currentTrack.
  // ──────────────────────────────────────────────────────────────────────────
  // DIAGNOSIS LOG: if this fix is correct, the "stale" log below should never fire.
  // If empty player screen still occurs, check console for "[handlePlay] STALE" to confirm/deny this theory.
  const handlePlay = useCallback((track: Track) => {
    if (selectMode) {
      // toggleSelect is defined later, use inline logic
      setSelectedTracks(prev => {
        const next = new Set(prev);
        if (next.has(track.id)) next.delete(track.id);
        else next.add(track.id);
        return next;
      });
      return;
    }
    const latest = usePlayerStore.getState().tracks.find(t => t.id === track.id);
    if (latest) {
      if (latest.analysisStatus !== track.analysisStatus || (latest.analysis && !track.analysis)) {
        console.warn(`[handlePlay] STALE item detected: id=${track.id}, ` +
          `item.status=${track.analysisStatus}, store.status=${latest.analysisStatus}, ` +
          `item.analysis=${!!track.analysis}, store.analysis=${!!latest.analysis}`);
      }
      setCurrentTrack(latest);
    } else {
      setCurrentTrack(track);
    }
    router.navigate('/(tabs)/player');
  }, [selectMode, setCurrentTrack, router]);

  const handleLongPress = useCallback((track: Track) => {
    if (selectMode) return;
    setActionSheetTrack(track);
  }, [selectMode]);

  // ─── Analysis queue (max 3, process one at a time) ───
  const [analysisQueue, setAnalysisQueue] = useState<string[]>([]);
  const analysisRunningRef = useRef(false);

  const applyAnalysisResult = useCallback((trackId: string, result: import('../../types/analysis').AnalysisResult) => {
    setTrackAnalysis(trackId, result);
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
      setServerEdition(trackId, boundaryBeatIndices);
    }
  }, [setTrackAnalysis, setServerEdition]);

  const processQueue = useCallback(async (queue: string[]) => {
    if (analysisRunningRef.current || queue.length === 0) return;
    analysisRunningRef.current = true;

    const trackId = queue[0];
    const track = usePlayerStore.getState().tracks.find(t => t.id === trackId);
    if (!track) {
      analysisRunningRef.current = false;
      setAnalysisQueue(q => q.slice(1));
      return;
    }

    setTrackAnalysisStatus(track.id, 'analyzing');
    try {
      const result = await analyzeTrack(
        track.uri, track.title, track.format,
        (jobId) => setTrackPendingJobId(track.id, jobId),
      );
      applyAnalysisResult(track.id, result);
      // Cloud Library: auto-register if cloud_track_id received
      if (result.cloudTrackId) {
        usePlayerStore.getState().updateTrackData(track.id, { cloudTrackId: result.cloudTrackId });
        registerCloudTrack(result.cloudTrackId, track.title).catch(() => {});
      }
    } catch (e: any) {
      const isBackgroundError = e.name === 'AbortError'
        || e.message?.includes('aborted')
        || e.message?.includes('Network request failed');
      if (isBackgroundError && usePlayerStore.getState().tracks.find(t => t.id === track.id)?.pendingJobId) {
        // background error with pending job — don't mark as error
      } else {
        setTrackAnalysisStatus(track.id, 'error');
        setTrackPendingJobId(track.id, undefined);
        Alert.alert(t('player.analysisFailed'), e.message || t('library.analysisServerError'));
      }
    }

    analysisRunningRef.current = false;
    // Remove finished track and continue with next
    setAnalysisQueue(q => q.slice(1));
  }, [applyAnalysisResult, setTrackAnalysisStatus, setTrackPendingJobId, t]);

  // Auto-process queue when it changes
  useEffect(() => {
    if (analysisQueue.length > 0 && !analysisRunningRef.current) {
      processQueue(analysisQueue);
    }
  }, [analysisQueue, processQueue]);

  const handleAnalyzePress = useCallback((track: Track) => {
    if (track.analysisStatus === 'analyzing' || track.analysisStatus === 'done') return;
    setAnalysisQueue(q => {
      if (q.includes(track.id)) return q;  // already queued
      if (q.length >= 3) return q;          // queue full
      return [...q, track.id];
    });
  }, []);

  const handleReanalyze = (track: Track) => {
    Alert.alert(t('library.reanalyzeTrack'), t('library.reanalyzeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('library.reanalyze'), style: 'destructive', onPress: () => {
        setAnalysisQueue(q => {
          if (q.includes(track.id)) return q;
          if (q.length >= 3) return q;
          return [...q, track.id];
        });
      }},
    ]);
  };

  // Resume pending analysis jobs when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      // Wait for network to reconnect after background
      await new Promise(r => setTimeout(r, 2000));
      const pending = usePlayerStore.getState().tracks.filter(
        t => t.analysisStatus === 'analyzing' && t.pendingJobId,
      );
      for (const track of pending) {
        // Retry up to 3 times with 2s delay
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await resumeAnalysisJob(track.pendingJobId!);
            applyAnalysisResult(track.id, result);
            break;
          } catch {
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 2000));
            } else {
              setTrackAnalysisStatus(track.id, 'error');
              setTrackPendingJobId(track.id, undefined);
            }
          }
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ─── Sort handler ─────────────────────────────────
  const handleSortPress = () => {
    const options = (['importedAt', 'title', 'bpm', 'duration'] as SortField[]).map(field => ({
      text: `${sortLabels[field]}${sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`,
      onPress: () => {
        if (sortBy === field) {
          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
          setSortBy(field);
          setSortOrder(field === 'title' ? 'asc' : 'desc');
        }
      },
    }));
    options.push({ text: t('common.cancel'), onPress: () => {} });
    Alert.alert(t('library.sort'), undefined, options);
  };

  // ─── Folder handlers ──────────────────────────────
  const handleCreateFolder = () => {
    showPrompt(t('library.newFolder'), '', (name) => {
      if (name.trim()) createFolder(name.trim(), activeTab);
    });
  };

  const handleFolderLongPress = (folder: Folder) => {
    Alert.alert(folder.name, undefined, [
      {
        text: t('common.edit'),
        onPress: () => {
          showPrompt(t('library.folderName'), folder.name, (name) => {
            if (name.trim()) renameFolder(folder.id, name.trim());
          });
        },
      },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('library.folder'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => deleteFolder(folder.id) },
          ]);
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const enterFolder = (folderId: string) => {
    clearSelection();
    setCurrentFolderId(folderId);
  };

  const exitFolder = () => {
    clearSelection();
    setCurrentFolderId(null);
  };

  // ─── Select handlers ──────────────────────────────
  const toggleSelect = useCallback((trackId: string) => {
    setSelectedTracks(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedTracks(new Set());

  const selectAll = () => {
    setSelectedTracks(new Set(displayTracks.map(t => t.id)));
  };

  const handleDeleteSelected = () => {
    Alert.alert(
      t('library.deleteTrack'),
      t('library.deleteTrackConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            const allTracks = usePlayerStore.getState().tracks;
            for (const id of selectedTracks) {
              removeTrack(id);
            }
            clearSelection();
          },
        },
      ],
    );
  };

  const handleMoveToFolder = () => {
    const tabFolders = folders.filter(f => f.mediaType === activeTab);
    const options = tabFolders.map(f => ({
      text: `📁 ${f.name}`,
      onPress: () => {
        moveTracksToFolder(Array.from(selectedTracks), f.id);
        clearSelection();
      },
    }));
    options.unshift({
      text: `📂 ${t('library.allTracks')}`,
      onPress: () => {
        moveTracksToFolder(Array.from(selectedTracks), undefined);
        clearSelection();
      },
    });
    options.push({ text: t('common.cancel'), onPress: () => {} });
    Alert.alert(t('library.folder'), undefined, options);
  };

  // Reset selection + exit folder on tab change
  const handleTabChange = (tab: MediaTab) => {
    if (tab !== activeTab) {
      clearSelection();
      setCurrentFolderId(null);
      setActiveTab(tab);
    }
  };

  // ─── Render ───────────────────────────────────────
  const totalTabTracks = tabTrackCount[activeTab];

  return (
    <View style={styles.container}>
      {/* ① Media Type Tabs */}
      <View style={styles.tabBar}>
        {mediaTabs.map(tab => {
          const isActive = activeTab === tab.key;
          const count = tabTrackCount[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => handleTabChange(tab.key)}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={isActive ? Colors.primary : Colors.textMuted}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.tabAddBtn} onPress={handleAddButton}>
          <Ionicons name="add" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* ② Folder Back Bar (inside folder) or Sort/Folder Toolbar (root) */}
      {currentFolderId ? (
        <View style={styles.folderBackBar}>
          <TouchableOpacity style={styles.folderBackBtn} onPress={exitFolder}>
            <Ionicons name="arrow-back" size={20} color={Colors.primary} />
            <Text style={styles.folderBackText}>{t('library.allTracks')}</Text>
          </TouchableOpacity>
          <Text style={styles.folderCurrentName} numberOfLines={1}>
            📁 {folders.find(f => f.id === currentFolderId)?.name ?? ''}
          </Text>
          <TouchableOpacity style={styles.sortButton} onPress={handleSortPress}>
            <Ionicons name="swap-vertical" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.sortButton} onPress={handleSortPress}>
            <Ionicons name="swap-vertical" size={16} color={Colors.textSecondary} />
            <Text style={styles.sortLabel}>
              {sortLabels[sortBy]} {sortOrder === 'asc' ? '↑' : '↓'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newFolderBtn} onPress={handleCreateFolder}>
            <Ionicons name="folder-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.newFolderLabel}>{t('library.newFolder')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ②-b Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('library.searchPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && Platform.OS === 'android' && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ③ Track List */}
      {filteredListData.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name={currentFolderId ? 'folder-open-outline' : activeTab === 'youtube' ? 'logo-youtube' : activeTab === 'video' ? 'videocam-outline' : 'musical-notes-outline'}
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {t('library.noTracks')}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('library.noTracksHint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredListData}
          keyExtractor={(item) => item.type === 'folder' ? `folder_${item.folder.id}` : `track_${item.track.id}`}
          renderItem={({ item }) => {
            if (item.type === 'folder') {
              return (
                <FolderItem
                  folder={item.folder}
                  trackCount={item.trackCount}
                  onPress={() => enterFolder(item.folder.id)}
                  onLongPress={() => handleFolderLongPress(item.folder)}
                />
              );
            }
            return (
              <SwipeableTrackItem
                track={item.track}
                editions={trackEditions[item.track.id]}
                hasFormation={!!trackFormations[item.track.id]?.server?.data?.keyframes?.length
                  || (trackFormations[item.track.id]?.userEditions?.length ?? 0) > 0}
                isSelected={selectedTracks.has(item.track.id)}
                selectMode={selectMode}
                isNowPlaying={isPlaying && currentTrack?.id === item.track.id}
                onPlay={handlePlay}
                onLongPressTrack={handleLongPress}
                onAnalyzeTrack={handleAnalyzePress}
                queuePosition={analysisQueue.indexOf(item.track.id) >= 0 ? analysisQueue.indexOf(item.track.id) + 1 : undefined}
                onToggleSelect={toggleSelect}
              />
            );
          }}
          contentContainerStyle={[styles.list, selectMode && { paddingBottom: 80 }]}
        />
      )}

      {/* ④ Select Mode Action Bar */}
      {selectMode && (
        <View style={[styles.selectBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Text style={styles.selectBarText}>✓ {selectedTracks.size}</Text>
          <TouchableOpacity style={styles.selectBarBtn} onPress={selectAll}>
            <Ionicons name="checkmark-done" size={18} color={Colors.primary} />
            <Text style={styles.selectBarBtnText}>{t('library.allTracks')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectBarBtn} onPress={handleMoveToFolder}>
            <Ionicons name="folder-outline" size={18} color={Colors.primary} />
            <Text style={styles.selectBarBtnText}>{t('library.folder')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectBarBtn} onPress={handleDeleteSelected}>
            <Ionicons name="trash-outline" size={18} color="#FF4444" />
            <Text style={[styles.selectBarBtnText, { color: '#FF4444' }]}>{t('common.delete')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectBarBtn} onPress={clearSelection}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
            <Text style={[styles.selectBarBtnText, { color: Colors.textSecondary }]}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ⑤ YouTube URL input overlay */}
      {showYouTubeInput && (
        <KeyboardAvoidingView
          style={styles.youtubeOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={100}
        >
          <TouchableOpacity
            style={styles.youtubeBackdrop}
            activeOpacity={1}
            onPress={() => { setShowYouTubeInput(false); setYoutubeUrl(''); }}
          />
          <View style={styles.youtubeInputPanel}>
            <Text style={styles.youtubeInputLabel}>YouTube URL</Text>
            <View style={styles.youtubeInputRow}>
              <TextInput
                style={styles.youtubeInput}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor={Colors.textMuted}
                value={youtubeUrl}
                onChangeText={setYoutubeUrl}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={true}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={handleAddYouTube}
              />
              <TouchableOpacity style={styles.youtubeAddBtn} onPress={handleAddYouTube}>
                <Ionicons name="add-circle" size={32} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => { setShowYouTubeInput(false); setYoutubeUrl(''); }}>
              <Text style={styles.youtubeCancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Analyze Mode Selection Modal */}
      <Modal
        visible={analyzeMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAnalyzeMenuVisible(false)}
      >
        <Pressable
          style={styles.analyzeBackdrop}
          onPress={() => setAnalyzeMenuVisible(false)}
        >
          <Pressable style={styles.analyzeMenuContainer} onPress={() => {}}>
            <Text style={styles.analyzeMenuTitle}>Analyze</Text>
            <TouchableOpacity
              style={styles.analyzeMenuOption}
              onPress={() => analyzeTarget && handleAnalyzePress(analyzeTarget)}
            >
              <Ionicons name="musical-notes-outline" size={22} color={Colors.primary} />
              <View style={styles.analyzeMenuOptionText}>
                <Text style={styles.analyzeMenuOptionTitle}>PhraseNote</Text>
                <Text style={styles.analyzeMenuOptionDesc}>Beat analysis + phrase detection</Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Text input prompt (cross-platform) */}
      <Modal
        visible={promptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptVisible(false)}
      >
        <Pressable style={styles.analyzeBackdrop} onPress={() => setPromptVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.promptContainer} onPress={() => {}}>
              <Text style={styles.promptTitle}>{promptTitle}</Text>
              <TextInput
                style={styles.promptInput}
                value={promptValue}
                onChangeText={setPromptValue}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  setPromptVisible(false);
                  promptCallback?.(promptValue);
                }}
              />
              <View style={styles.promptButtons}>
                <TouchableOpacity
                  style={styles.promptCancelBtn}
                  onPress={() => setPromptVisible(false)}
                >
                  <Text style={styles.promptCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.promptConfirmBtn}
                  onPress={() => {
                    setPromptVisible(false);
                    promptCallback?.(promptValue);
                  }}
                >
                  <Text style={styles.promptConfirmText}>{t('common.confirm', { defaultValue: '확인' })}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Track Long-Press Action Sheet */}
      <Modal
        visible={actionSheetTrack !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetTrack(null)}
      >
        <Pressable style={styles.analyzeBackdrop} onPress={() => setActionSheetTrack(null)}>
          <Pressable style={styles.actionSheetContainer} onPress={() => {}}>
            <Text style={styles.actionSheetTitle} numberOfLines={2}>{actionSheetTrack?.title}</Text>
            <View style={styles.actionSheetDivider} />
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={() => {
                const track = actionSheetTrack!;
                setActionSheetTrack(null);
                showPrompt(t('library.renameTrack'), track.title, (newTitle) => {
                  if (newTitle.trim()) renameTrack(track.id, newTitle.trim());
                });
              }}
            >
              <Ionicons name="pencil-outline" size={20} color={Colors.text} />
              <Text style={styles.actionSheetOptionText}>{t('library.rename')}</Text>
            </TouchableOpacity>
            {actionSheetTrack && actionSheetTrack.mediaType !== 'youtube' && actionSheetTrack.analysisStatus === 'done' && (
              <TouchableOpacity
                style={styles.actionSheetOption}
                onPress={() => {
                  const track = actionSheetTrack!;
                  setActionSheetTrack(null);
                  handleReanalyze(track);
                }}
              >
                <Ionicons name="refresh-outline" size={20} color={Colors.text} />
                <Text style={styles.actionSheetOptionText}>{t('library.reanalyze')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={() => {
                const trackId = actionSheetTrack!.id;
                setActionSheetTrack(null);
                removeTrack(trackId);
              }}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
              <Text style={[styles.actionSheetOptionText, { color: Colors.error }]}>{t('common.delete')}</Text>
            </TouchableOpacity>
            <View style={styles.actionSheetDivider} />
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={() => setActionSheetTrack(null)}
            >
              <Text style={[styles.actionSheetOptionText, { color: Colors.textSecondary, textAlign: 'center', flex: 1 }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ─── Tab Bar ──────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: Colors.primary,
  },
  tabLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.primary,
  },
  tabBadge: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(212, 168, 84, 0.2)',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabBadgeTextActive: {
    color: Colors.primary,
  },
  tabAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },

  // ─── Sort / Folder Toolbar ────────────────────────
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
  },
  sortLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  newFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
  },
  newFolderLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  // ─── Folder Back Bar ────────────────────────────────
  folderBackBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  folderBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingRight: 8,
  },
  folderBackText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  folderCurrentName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '700',
  },

  // ─── Search Bar ─────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginVertical: 6,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    padding: 0,
  },

  // ─── Empty ────────────────────────────────────────
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '600', marginTop: Spacing.md },
  emptySubtitle: { color: Colors.textSecondary, fontSize: FontSize.md },

  // ─── List ─────────────────────────────────────────
  list: { padding: Spacing.md },

  // ─── Folder Item ──────────────────────────────────
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  folderName: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  folderCount: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },

  // ─── Track Item ───────────────────────────────────
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  trackItemSelected: {
    backgroundColor: 'rgba(212, 168, 84, 0.1)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  trackItemNowPlaying: {
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 84, 0.6)',
    backgroundColor: 'rgba(212, 168, 84, 0.06)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  selectCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  selectCheckActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  mediaThumbnail: {
    width: 64,
    height: 44,
    borderRadius: 8,
    marginRight: Spacing.md,
    backgroundColor: '#000',
  },
  trackIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  trackInfo: { flex: 1 },
  trackTitle: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '500' },
  trackMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  trackMeta: { color: Colors.textSecondary, fontSize: FontSize.sm },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeDone: { backgroundColor: 'rgba(76, 175, 80, 0.2)' },
  badgeAnalyzing: { backgroundColor: 'rgba(232, 168, 48, 0.15)' },
  badgeError: { backgroundColor: 'rgba(244, 67, 54, 0.15)' },
  badgeText: { color: '#4CAF50', fontSize: FontSize.xs, fontWeight: '600' },
  badgeAnalyzingText: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '600' },
  analyzeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },

  // ─── Select Mode Action Bar ───────────────────────
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    gap: Spacing.md,
  },
  selectBarText: {
    flex: 1,
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  selectBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  selectBarBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // ─── Swipeable Actions ────────────────────────────
  swipeEditionUser: { backgroundColor: 'rgba(212, 168, 84, 0.25)' },
  swipeEditionActive: { borderWidth: 2, borderColor: Colors.text },
  swipeEditionText: { fontSize: 18, fontWeight: '800' },
  swipeEditionTextServer: { color: Colors.warning },
  swipeEditionTextUser: { color: Colors.primaryLight },

  swipeSelectBtn: {
    width: 50,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginRight: 4,
    backgroundColor: 'rgba(201, 169, 110, 0.15)',
    marginBottom: Spacing.sm,
  },

  // ─── Edition Indicators ───────────────────────────
  editionIndicators: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  editionDot: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  editionDotServer: { backgroundColor: 'rgba(232, 168, 48, 0.3)' },
  editionDotUser: { backgroundColor: 'rgba(212, 168, 84, 0.3)' },
  editionDotActive: { borderWidth: 1.5, borderColor: Colors.text, opacity: 1 },
  editionDotText: { fontSize: 9, fontWeight: '700', color: Colors.text },

  // ─── YouTube URL input ────────────────────────────
  youtubeOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', zIndex: 10 },
  youtubeBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  youtubeInputPanel: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  youtubeInputLabel: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm },
  youtubeInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  youtubeInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  youtubeAddBtn: { padding: Spacing.xs },
  youtubeCancel: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm },

  // ─── Analyze Menu Modal ─────────────────────────────
  analyzeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingVertical: Spacing.sm,
  },
  analyzeMenuOptionText: { flex: 1 },
  analyzeMenuOptionTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '600' },
  analyzeMenuOptionDesc: { color: Colors.textSecondary, fontSize: FontSize.xs },
  analyzeMenuDivider: { height: 1, backgroundColor: Colors.border },
  dancerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dancerCountLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  dancerCountStepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dancerCountBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dancerCountValue: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700', minWidth: 24, textAlign: 'center' },

  // ─── Text Input Prompt ──────────────────────────────
  promptContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    minWidth: 280,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  promptTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  promptInput: {
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
  promptButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  promptCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
  },
  promptCancelText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  promptConfirmBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  promptConfirmText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // ─── Track Action Sheet ────────────────────────────
  actionSheetContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    width: 280,
    gap: 4,
  },
  actionSheetTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  actionSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  actionSheetOptionText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
});
