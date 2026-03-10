import { useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { pickMediaFile, parseYouTubeUrl, createYouTubeTrack } from '../../services/fileImport';
import { analyzeTrack } from '../../services/analysisApi';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { Track } from '../../types/track';
import { EditionId, TrackEditions } from '../../types/analysis';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  // YouTube: remote thumbnail
  if (track.mediaType === 'youtube') {
    return (
      <Image
        source={{ uri: `https://img.youtube.com/vi/${track.uri}/mqdefault.jpg` }}
        style={styles.mediaThumbnail}
      />
    );
  }
  // Video with generated thumbnail
  if (track.thumbnailUri) {
    return (
      <Image source={{ uri: track.thumbnailUri }} style={styles.mediaThumbnail} />
    );
  }
  // Fallback icon
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
          styles.editionDot,
          styles.editionDotServer,
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
            styles.editionDot,
            styles.editionDotUser,
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
  track,
  editions,
  onPress,
  onLongPress,
  onAnalyze,
}: {
  track: Track;
  editions?: TrackEditions;
  onPress: () => void;
  onLongPress: () => void;
  onAnalyze: () => void;
}) {
  return (
    <TouchableOpacity style={styles.trackItem} onPress={onPress} onLongPress={onLongPress}>
      <TrackThumbnail track={track} />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <View style={styles.trackMetaRow}>
          <Text style={styles.trackMeta}>
            {track.mediaType === 'youtube' ? 'YouTube' : `${track.format.toUpperCase()} · ${formatFileSize(track.fileSize)}`}
          </Text>
          <AnalysisBadge track={track} />
          <EditionIndicators editions={editions} />
        </View>
      </View>
      {track.mediaType !== 'youtube' && (track.analysisStatus === 'idle' || track.analysisStatus === 'error') ? (
        <TouchableOpacity style={styles.analyzeButton} onPress={onAnalyze}>
          <Ionicons name="analytics-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

function SwipeableTrackItem({
  track,
  editions,
  onPress,
  onLongPress,
  onAnalyze,
  onSelectEdition,
  onDeleteEdition,
}: {
  track: Track;
  editions?: TrackEditions;
  onPress: () => void;
  onLongPress: () => void;
  onAnalyze: () => void;
  onSelectEdition: (trackId: string, editionId: EditionId) => void;
  onDeleteEdition: (trackId: string, editionId: EditionId) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const hasEditions = editions && (editions.server || editions.userEditions.length > 0);

  const renderRightActions = useCallback(() => {
    if (!editions || !hasEditions) return null;
    const activeId = editions.activeEditionId;
    const allEditions: { id: EditionId; isServer: boolean }[] = [];

    if (editions.server) {
      allEditions.push({ id: 'S', isServer: true });
    }
    for (const id of ['1', '2', '3'] as EditionId[]) {
      if (editions.userEditions.some(e => e.id === id)) {
        allEditions.push({ id, isServer: false });
      }
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
            onPress={() => {
              onSelectEdition(track.id, id);
              swipeableRef.current?.close();
            }}
            onLongPress={() => {
              if (isServer) {
                Alert.alert('Server Edition', '서버 분석 에디션은 삭제할 수 없습니다.');
              } else {
                Alert.alert(
                  `에디션 ${id} 삭제`,
                  '이 에디션을 삭제하시겠습니까?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        onDeleteEdition(track.id, id);
                        swipeableRef.current?.close();
                      },
                    },
                  ],
                );
              }
            }}
          >
            <Text style={[
              styles.swipeEditionText,
              isServer ? styles.swipeEditionTextServer : styles.swipeEditionTextUser,
            ]}>
              {id}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [editions, track.id, onSelectEdition, onDeleteEdition]);

  if (!hasEditions) {
    return (
      <TrackItem
        track={track}
        editions={editions}
        onPress={onPress}
        onLongPress={onLongPress}
        onAnalyze={onAnalyze}
      />
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
    >
      <TrackItem
        track={track}
        editions={editions}
        onPress={onPress}
        onLongPress={onLongPress}
        onAnalyze={onAnalyze}
      />
    </Swipeable>
  );
}

export default function LibraryScreen() {
  const { tracks, addTrack, removeTrack, renameTrack, setCurrentTrack, setTrackAnalysisStatus, setTrackAnalysis } = usePlayerStore();
  const trackEditions = useSettingsStore((s) => s.trackEditions);
  const setActiveEdition = useSettingsStore((s) => s.setActiveEdition);
  const deleteUserEdition = useSettingsStore((s) => s.deleteUserEdition);
  const setServerEdition = useSettingsStore((s) => s.setServerEdition);
  const router = useRouter();
  const [showYouTubeInput, setShowYouTubeInput] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const handleImport = async () => {
    const track = await pickMediaFile();
    if (track) {
      addTrack(track);
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
    setCurrentTrack(track);
    router.navigate('/(tabs)/player');
  };

  const handleReanalyze = (track: Track) => {
    Alert.alert(
      'Re-analyze Track',
      '기존 분석 데이터(BPM, 박자, 프레이즈 등)가 삭제되고 새로 분석됩니다. 계속하시겠습니까?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-analyze',
          style: 'destructive',
          onPress: () => handleAnalyze(track),
        },
      ],
    );
  };

  const handleLongPress = (track: Track) => {
    const options: any[] = [
      {
        text: 'Rename',
        onPress: () => {
          Alert.prompt(
            'Rename Track',
            'Enter new title:',
            (newTitle) => {
              if (newTitle && newTitle.trim()) {
                renameTrack(track.id, newTitle.trim());
              }
            },
            'plain-text',
            track.title,
          );
        },
      },
    ];
    // Show re-analyze option for non-YouTube tracks that have been analyzed
    if (track.mediaType !== 'youtube' && track.analysisStatus === 'done') {
      options.push({
        text: 'Re-analyze',
        onPress: () => handleReanalyze(track),
      });
    }
    options.push(
      { text: 'Delete', style: 'destructive', onPress: () => removeTrack(track.id) },
      { text: 'Cancel', style: 'cancel' },
    );
    Alert.alert(track.title, undefined, options);
  };

  const handleAnalyze = async (track: Track) => {
    setTrackAnalysisStatus(track.id, 'analyzing');
    try {
      const result = await analyzeTrack(track.uri, track.title, track.format);
      setTrackAnalysis(track.id, result);
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
        setServerEdition(track.id, boundaryBeatIndices);
      }
    } catch (e: any) {
      setTrackAnalysisStatus(track.id, 'error');
      Alert.alert('Analysis Failed', e.message || 'Could not connect to analysis server.');
    }
  };

  return (
    <View style={styles.container}>
      {tracks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="musical-notes-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No tracks yet</Text>
          <Text style={styles.emptySubtitle}>Import audio or video files to start practicing</Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SwipeableTrackItem
              track={item}
              editions={trackEditions[item.id]}
              onPress={() => handlePlay(item)}
              onLongPress={() => handleLongPress(item)}
              onAnalyze={() => handleAnalyze(item)}
              onSelectEdition={setActiveEdition}
              onDeleteEdition={deleteUserEdition}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}

      {/* YouTube URL input — modal overlay at top, keyboard-aware */}
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

      {/* FAB buttons: file import + YouTube */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fabSmall, styles.fabYouTube]}
          onPress={() => setShowYouTubeInput(!showYouTubeInput)}
        >
          <Ionicons name="logo-youtube" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={handleImport}>
          <Ionicons name="add" size={28} color={Colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '600', marginTop: Spacing.md },
  emptySubtitle: { color: Colors.textSecondary, fontSize: FontSize.md },
  list: { padding: Spacing.md },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
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
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
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
  fabContainer: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fabSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabYouTube: {
    backgroundColor: '#CC0000',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  // YouTube URL input — modal overlay
  youtubeOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    zIndex: 10,
  },
  youtubeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
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
  youtubeInputLabel: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  youtubeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
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
  youtubeAddBtn: {
    padding: Spacing.xs,
  },
  youtubeCancel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // ─── Edition Indicators (small dots next to BPM badge) ───
  editionIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  editionDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editionDotServer: {
    backgroundColor: 'rgba(255, 193, 7, 0.3)',
  },
  editionDotUser: {
    backgroundColor: 'rgba(156, 39, 176, 0.3)',
  },
  editionDotActive: {
    borderWidth: 1.5,
    borderColor: Colors.text,
    opacity: 1,
  },
  editionDotText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text,
  },

  // ─── Swipeable Edition Actions ────────────────────
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
  swipeEditionServer: {
    backgroundColor: 'rgba(255, 193, 7, 0.25)',
  },
  swipeEditionUser: {
    backgroundColor: 'rgba(156, 39, 176, 0.25)',
  },
  swipeEditionActive: {
    borderWidth: 2,
    borderColor: Colors.text,
  },
  swipeEditionText: {
    fontSize: 18,
    fontWeight: '800',
  },
  swipeEditionTextServer: {
    color: '#FFC107',
  },
  swipeEditionTextUser: {
    color: '#CE93D8',
  },
});
