import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { pickMediaFile, parseYouTubeUrl, createYouTubeTrack } from '../../services/fileImport';
import { analyzeTrack } from '../../services/analysisApi';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { Track, MediaType, Folder, SortField } from '../../types/track';
import { EditionId, TrackEditions } from '../../types/analysis';

// ─── Helpers ────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SORT_LABELS: Record<SortField, string> = {
  importedAt: '최신순',
  title: '이름순',
  bpm: 'BPM순',
  duration: '길이순',
};

type MediaTab = 'audio' | 'video' | 'youtube';
const MEDIA_TABS: { key: MediaTab; label: string; icon: string }[] = [
  { key: 'audio', label: 'Audio', icon: 'musical-notes' },
  { key: 'video', label: 'Video', icon: 'videocam' },
  { key: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
];

// ─── Sub-components ─────────────────────────────────
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
          <ActivityIndicator size="small" color={Colors.warning} />
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

function EditionIndicators({ editions }: { editions?: TrackEditions }) {
  if (!editions) return null;
  const activeId = editions.activeEditionId;
  const hasServer = !!editions.server;
  const userIds = editions.userEditions.map(e => e.id);
  if (!hasServer && userIds.length === 0) return null;

  return (
    <View style={styles.editionIndicators}>
      {hasServer && (
        <View style={[
          styles.editionDot, styles.editionDotServer,
          activeId === 'S' && styles.editionDotActive,
          activeId !== 'S' && { opacity: 0.4 },
        ]}>
          <Text style={styles.editionDotText}>S</Text>
        </View>
      )}
      {(['1', '2', '3'] as EditionId[]).map(id => {
        if (!userIds.includes(id)) return null;
        return (
          <View key={id} style={[
            styles.editionDot, styles.editionDotUser,
            activeId === id && styles.editionDotActive,
            activeId !== id && { opacity: 0.4 },
          ]}>
            <Text style={styles.editionDotText}>{id}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TrackItem({
  track, editions, isSelected, selectMode, isNowPlaying,
  onPress, onLongPress, onAnalyze,
}: {
  track: Track;
  editions?: TrackEditions;
  isSelected: boolean;
  selectMode: boolean;
  isNowPlaying: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onAnalyze: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <View style={[styles.trackItem, isSelected && styles.trackItemSelected, isNowPlaying && styles.trackItemNowPlaying]}>
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
            <EditionIndicators editions={editions} />
          </View>
        </View>
        {!selectMode && (
          isNowPlaying ? (
            <Ionicons name="volume-high" size={20} color={Colors.primary} />
          ) : track.mediaType !== 'youtube' && (track.analysisStatus === 'idle' || track.analysisStatus === 'error') ? (
            <TouchableOpacity style={styles.analyzeButton} onPress={onAnalyze}>
              <Ionicons name="analytics-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          )
        )}
      </View>
    </TouchableOpacity>
  );
}

function SwipeableTrackItem({
  track, editions, isSelected, selectMode, isNowPlaying,
  onPress, onLongPress, onAnalyze,
  onSelectEdition, onDeleteEdition, onToggleSelect,
}: {
  track: Track;
  editions?: TrackEditions;
  isSelected: boolean;
  selectMode: boolean;
  isNowPlaying: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onAnalyze: () => void;
  onSelectEdition: (trackId: string, editionId: EditionId) => void;
  onDeleteEdition: (trackId: string, editionId: EditionId) => void;
  onToggleSelect: (trackId: string) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const hasEditions = editions && (editions.server || editions.userEditions.length > 0);

  const renderRightActions = useCallback(() => {
    if (!editions || !hasEditions) return null;
    const activeId = editions.activeEditionId;
    const allEditions: { id: EditionId; isServer: boolean }[] = [];
    if (editions.server) allEditions.push({ id: 'S', isServer: true });
    for (const id of ['1', '2', '3'] as EditionId[]) {
      if (editions.userEditions.some(e => e.id === id)) allEditions.push({ id, isServer: false });
    }

    return (
      <View style={styles.swipeActions}>
        {allEditions.map(({ id, isServer }) => (
          <TouchableOpacity
            key={id}
            style={[
              styles.swipeEditionBtn,
              isServer ? styles.swipeEditionServer : styles.swipeEditionUser,
              activeId === id && styles.swipeEditionActive,
            ]}
            onPress={() => { onSelectEdition(track.id, id); swipeableRef.current?.close(); }}
            onLongPress={() => {
              if (isServer) {
                Alert.alert('Server Edition', '서버 분석 에디션은 삭제할 수 없습니다.');
              } else {
                Alert.alert(`에디션 ${id} 삭제`, '이 에디션을 삭제하시겠습니까?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { onDeleteEdition(track.id, id); swipeableRef.current?.close(); } },
                ]);
              }
            }}
          >
            <Text style={[styles.swipeEditionText, isServer ? styles.swipeEditionTextServer : styles.swipeEditionTextUser]}>{id}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [editions, track.id, onSelectEdition, onDeleteEdition]);

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
      renderRightActions={hasEditions ? renderRightActions : undefined}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      leftThreshold={40}
      onSwipeableOpen={handleSwipeOpen}
    >
      <TrackItem
        track={track}
        editions={editions}
        isSelected={isSelected}
        selectMode={selectMode}
        isNowPlaying={isNowPlaying}
        onPress={onPress}
        onLongPress={onLongPress}
        onAnalyze={onAnalyze}
      />
    </Swipeable>
  );
}

function FolderItem({
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
}

// ─── Main Screen ────────────────────────────────────
export default function LibraryScreen() {
  const {
    tracks, addTrack, removeTrack, renameTrack,
    setCurrentTrack, setTrackAnalysisStatus, setTrackAnalysis,
    folders, createFolder, renameFolder, deleteFolder, moveTracksToFolder,
    sortBy, sortOrder, setSortBy, setSortOrder,
    currentTrack, isPlaying,
  } = usePlayerStore();
  const trackEditions = useSettingsStore((s) => s.trackEditions);
  const setActiveEdition = useSettingsStore((s) => s.setActiveEdition);
  const deleteUserEdition = useSettingsStore((s) => s.deleteUserEdition);
  const setServerEdition = useSettingsStore((s) => s.setServerEdition);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Local UI state
  const [activeTab, setActiveTab] = useState<MediaTab>('audio');
  const [showYouTubeInput, setShowYouTubeInput] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const selectMode = selectedTracks.size > 0;

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

  // ─── Handlers ─────────────────────────────────────
  const handleImport = async () => {
    const filterType = activeTab === 'youtube' ? undefined : activeTab;
    const track = await pickMediaFile(filterType);
    if (track) addTrack(track);
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
      Alert.alert('Invalid URL', 'Please enter a valid YouTube URL.');
      return;
    }
    const track = createYouTubeTrack(videoId);
    addTrack(track);
    setYoutubeUrl('');
    setShowYouTubeInput(false);
  };

  const handlePlay = (track: Track) => {
    if (selectMode) {
      toggleSelect(track.id);
      return;
    }
    setCurrentTrack(track);
    router.navigate('/(tabs)/player');
  };

  const handleLongPress = (track: Track) => {
    if (selectMode) return;
    const options: any[] = [
      {
        text: 'Rename',
        onPress: () => {
          Alert.prompt('Rename Track', 'Enter new title:', (newTitle) => {
            if (newTitle && newTitle.trim()) renameTrack(track.id, newTitle.trim());
          }, 'plain-text', track.title);
        },
      },
    ];
    if (track.mediaType !== 'youtube' && track.analysisStatus === 'done') {
      options.push({ text: 'Re-analyze', onPress: () => handleReanalyze(track) });
    }
    options.push(
      { text: 'Delete', style: 'destructive', onPress: () => removeTrack(track.id) },
      { text: 'Cancel', style: 'cancel' },
    );
    Alert.alert(track.title, undefined, options);
  };

  const handleReanalyze = (track: Track) => {
    Alert.alert('Re-analyze Track', '기존 분석 데이터가 삭제되고 새로 분석됩니다. 계속하시겠습니까?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Re-analyze', style: 'destructive', onPress: () => handleAnalyze(track) },
    ]);
  };

  const handleAnalyze = async (track: Track) => {
    setTrackAnalysisStatus(track.id, 'analyzing');
    try {
      const result = await analyzeTrack(track.uri, track.title, track.format);
      setTrackAnalysis(track.id, result);
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
        setServerEdition(track.id, boundaryBeatIndices);
      }
    } catch (e: any) {
      setTrackAnalysisStatus(track.id, 'error');
      Alert.alert('Analysis Failed', e.message || 'Could not connect to analysis server.');
    }
  };

  // ─── Sort handler ─────────────────────────────────
  const handleSortPress = () => {
    const options = (['importedAt', 'title', 'bpm', 'duration'] as SortField[]).map(field => ({
      text: `${SORT_LABELS[field]}${sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`,
      onPress: () => {
        if (sortBy === field) {
          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
          setSortBy(field);
          setSortOrder(field === 'title' ? 'asc' : 'desc');
        }
      },
    }));
    options.push({ text: 'Cancel', onPress: () => {} });
    Alert.alert('정렬 기준', undefined, options);
  };

  // ─── Folder handlers ──────────────────────────────
  const handleCreateFolder = () => {
    Alert.prompt('새 폴더', '폴더 이름을 입력하세요:', (name) => {
      if (name && name.trim()) createFolder(name.trim(), activeTab);
    }, 'plain-text');
  };

  const handleFolderLongPress = (folder: Folder) => {
    Alert.alert(folder.name, undefined, [
      {
        text: '이름 변경',
        onPress: () => {
          Alert.prompt('폴더 이름 변경', '새 이름:', (name) => {
            if (name && name.trim()) renameFolder(folder.id, name.trim());
          }, 'plain-text', folder.name);
        },
      },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          Alert.alert('폴더 삭제', '폴더를 삭제하시겠습니까?\n(트랙은 삭제되지 않고 루트로 이동됩니다)', [
            { text: 'Cancel', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: () => deleteFolder(folder.id) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
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
  const toggleSelect = (trackId: string) => {
    setSelectedTracks(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const clearSelection = () => setSelectedTracks(new Set());

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
      text: '📂 루트 (미분류)',
      onPress: () => {
        moveTracksToFolder(Array.from(selectedTracks), undefined);
        clearSelection();
      },
    });
    options.push({ text: 'Cancel', onPress: () => {} });
    Alert.alert('폴더 이동', `${selectedTracks.size}개 트랙을 이동할 폴더를 선택하세요`, options);
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
        {MEDIA_TABS.map(tab => {
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
            <Text style={styles.folderBackText}>전체 목록</Text>
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
              {SORT_LABELS[sortBy]} {sortOrder === 'asc' ? '↑' : '↓'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newFolderBtn} onPress={handleCreateFolder}>
            <Ionicons name="folder-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.newFolderLabel}>새 폴더</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ③ Track List */}
      {listData.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name={currentFolderId ? 'folder-open-outline' : activeTab === 'youtube' ? 'logo-youtube' : activeTab === 'video' ? 'videocam-outline' : 'musical-notes-outline'}
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {currentFolderId ? '폴더가 비어있습니다' : activeTab === 'youtube' ? 'No YouTube tracks' : activeTab === 'video' ? 'No video files' : 'No audio files'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {currentFolderId ? '트랙을 이 폴더로 이동해보세요' : activeTab === 'youtube' ? 'Add YouTube URLs to start' : 'Import files to start practicing'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
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
                isSelected={selectedTracks.has(item.track.id)}
                selectMode={selectMode}
                isNowPlaying={isPlaying && currentTrack?.id === item.track.id}
                onPress={() => handlePlay(item.track)}
                onLongPress={() => handleLongPress(item.track)}
                onAnalyze={() => handleAnalyze(item.track)}
                onSelectEdition={setActiveEdition}
                onDeleteEdition={deleteUserEdition}
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
          <Text style={styles.selectBarText}>✓ {selectedTracks.size}개 선택됨</Text>
          <TouchableOpacity style={styles.selectBarBtn} onPress={handleMoveToFolder}>
            <Ionicons name="folder-outline" size={18} color={Colors.primary} />
            <Text style={styles.selectBarBtnText}>폴더 이동</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectBarBtn} onPress={clearSelection}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
            <Text style={[styles.selectBarBtnText, { color: Colors.textSecondary }]}>해제</Text>
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
              <Text style={styles.youtubeCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
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
    backgroundColor: 'rgba(187, 134, 252, 0.2)',
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
  },
  trackItemSelected: {
    backgroundColor: 'rgba(187, 134, 252, 0.1)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  trackItemNowPlaying: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    backgroundColor: 'rgba(187, 134, 252, 0.08)',
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
  badgeAnalyzing: { backgroundColor: 'rgba(255, 193, 7, 0.15)' },
  badgeError: { backgroundColor: 'rgba(244, 67, 54, 0.15)' },
  badgeText: { color: '#4CAF50', fontSize: FontSize.xs, fontWeight: '600' },
  analyzeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
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
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  swipeEditionBtn: {
    width: 52,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 4,
  },
  swipeEditionServer: { backgroundColor: 'rgba(255, 193, 7, 0.25)' },
  swipeEditionUser: { backgroundColor: 'rgba(156, 39, 176, 0.25)' },
  swipeEditionActive: { borderWidth: 2, borderColor: Colors.text },
  swipeEditionText: { fontSize: 18, fontWeight: '800' },
  swipeEditionTextServer: { color: '#FFC107' },
  swipeEditionTextUser: { color: '#CE93D8' },

  swipeSelectBtn: {
    width: 50,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginRight: 4,
    backgroundColor: 'rgba(3, 218, 198, 0.15)',
    marginBottom: Spacing.sm,
  },

  // ─── Edition Indicators ───────────────────────────
  editionIndicators: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  editionDot: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  editionDotServer: { backgroundColor: 'rgba(255, 193, 7, 0.3)' },
  editionDotUser: { backgroundColor: 'rgba(156, 39, 176, 0.3)' },
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
});
