import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../../stores/playerStore';
import { pickAudioFile } from '../../services/fileImport';
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

function TrackItem({
  track,
  onPress,
  onDelete,
  onAnalyze,
}: {
  track: Track;
  onPress: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
}) {
  return (
    <TouchableOpacity style={styles.trackItem} onPress={onPress} onLongPress={onDelete}>
      <View style={styles.trackIcon}>
        <Ionicons name="musical-notes" size={24} color={Colors.primary} />
      </View>
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <View style={styles.trackMetaRow}>
          <Text style={styles.trackMeta}>
            {track.format.toUpperCase()} · {formatFileSize(track.fileSize)}
          </Text>
          <AnalysisBadge track={track} />
        </View>
      </View>
      {track.analysisStatus === 'idle' || track.analysisStatus === 'error' ? (
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
  const { tracks, addTrack, removeTrack, setCurrentTrack, setTrackAnalysisStatus, setTrackAnalysis } = usePlayerStore();
  const router = useRouter();

  const handleImport = async () => {
    const track = await pickAudioFile();
    if (track) {
      addTrack(track);
    }
  };

  const handlePlay = (track: Track) => {
    setCurrentTrack(track);
    router.navigate('/(tabs)/player');
  };

  const handleDelete = (track: Track) => {
    Alert.alert('Delete Track', `Remove "${track.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeTrack(track.id) },
    ]);
  };

  const handleAnalyze = async (track: Track) => {
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
          <Text style={styles.emptySubtitle}>Import audio files to start practicing</Text>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TrackItem
              track={item}
              onPress={() => handlePlay(item)}
              onDelete={() => handleDelete(item)}
              onAnalyze={() => handleAnalyze(item)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleImport}>
        <Ionicons name="add" size={28} color={Colors.text} />
      </TouchableOpacity>
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
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
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
});
