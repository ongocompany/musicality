import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { pickMediaFile, parseYouTubeUrl, createYouTubeTrack } from '../../services/fileImport';
import { analyzeTrack } from '../../services/analysisApi';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { Track } from '../../types/track';

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

function TrackItem({
  track,
  onPress,
  onLongPress,
  onAnalyze,
}: {
  track: Track;
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

export default function LibraryScreen() {
  const { tracks, addTrack, removeTrack, renameTrack, setCurrentTrack, setTrackAnalysisStatus, setTrackAnalysis } = usePlayerStore();
  const clearPhraseBoundaryOverrides = useSettingsStore((s) => s.clearPhraseBoundaryOverrides);
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
    // Clear user phrase edits so fresh analysis takes effect
    clearPhraseBoundaryOverrides(track.id);
    setTrackAnalysisStatus(track.id, 'analyzing');
    try {
      const result = await analyzeTrack(track.uri, track.title, track.format);
      setTrackAnalysis(track.id, result);
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
            <TrackItem
              track={item}
              onPress={() => handlePlay(item)}
              onLongPress={() => handleLongPress(item)}
              onAnalyze={() => handleAnalyze(item)}
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
});
