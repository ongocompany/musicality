import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { useCommunityStore } from '../../stores/communityStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { ImportedPhraseNote, PhraseNoteFile } from '../../types/phraseNote';
import { findMatchingTrack, validatePhraseNote } from '../../services/phraseNoteService';
import { Colors, Spacing, FontSize, NoteTypeColors } from '../../constants/theme';

export default function SongThreadScreen() {
  const router = useRouter();
  const { id, crewId } = useLocalSearchParams<{ id: string; crewId: string }>();
  const { user } = useAuthStore();
  const {
    activeSongThreads,
    activeThreadNotes,
    loading,
    fetchThreadNotes,
    postPhraseNote,
  } = useCommunityStore();

  const [refreshing, setRefreshing] = useState(false);
  const [description, setDescription] = useState('');

  const tracks = usePlayerStore((s) => s.tracks);
  const addImportedNote = useSettingsStore((s) => s.addImportedNote);
  const setActiveImportedNote = useSettingsStore((s) => s.setActiveImportedNote);

  const thread = activeSongThreads.find((t) => t.id === id);

  const handleImportNote = useCallback((phraseNoteData: any, authorName?: string, avatarUrl?: string | null) => {
    try {
      const pnote = phraseNoteData as PhraseNoteFile;
      // Use post author name if metadata author is missing
      if (authorName && (!pnote.metadata.author || pnote.metadata.author === 'Unknown')) {
        pnote.metadata.author = authorName;
      }
      const validationError = validatePhraseNote(pnote);
      if (validationError) {
        Alert.alert('Error', validationError);
        return;
      }

      // Try matching by fingerprint first, then by title
      let matchedTrackId: string | null = null;
      if (pnote.analysis.fingerprint) {
        matchedTrackId = findMatchingTrack(tracks, pnote);
      }
      if (!matchedTrackId && thread) {
        // Fallback: match by thread title (song title)
        const titleMatch = tracks.find(t =>
          t.title.toLowerCase().includes(thread.title.toLowerCase()) ||
          thread.title.toLowerCase().includes(t.title.toLowerCase())
        );
        if (titleMatch) matchedTrackId = titleMatch.id;
      }

      if (!matchedTrackId) {
        Alert.alert('No Match', 'Add this song to your library first, then try again.');
        return;
      }

      const noteId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const imported: ImportedPhraseNote = {
        id: noteId,
        trackId: matchedTrackId,
        phraseNote: pnote,
        importedAt: Date.now(),
        isActive: true,
        authorAvatarUrl: avatarUrl ?? undefined,
      };

      setActiveImportedNote(matchedTrackId, null);
      addImportedNote(imported);

      const noteLabel = pnote.format === 'cnote' ? 'ChoreoNote' : 'PhraseNote';
      Alert.alert('Imported!', `${pnote.metadata.author}'s ${noteLabel} has been loaded.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to import note');
    }
  }, [tracks, thread, addImportedNote, setActiveImportedNote]);
  const notes = id ? activeThreadNotes[id] ?? [] : [];

  useEffect(() => {
    if (id) fetchThreadNotes(id);
  }, [id]);

  const onRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await fetchThreadNotes(id);
    setRefreshing(false);
  }, [id]);

  if (!thread) {
    return (
      <>
        <Stack.Screen options={{ title: 'Thread' }} />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Thread not found</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: thread.title,
          headerRight: () => (
            <View style={styles.headerMeta}>
              {thread.bpm ? (
                <Text style={styles.headerBpm}>{thread.bpm} BPM</Text>
              ) : null}
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          {/* Thread Info */}
          <View style={styles.threadInfo}>
            <Ionicons name="musical-notes" size={24} color={Colors.primary} />
            <View style={styles.threadInfoText}>
              <Text style={styles.threadTitle}>{thread.title}</Text>
              <Text style={styles.threadMeta}>
                {thread.danceStyle} · {thread.postCount} note{thread.postCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* Notes List */}
          {notes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No PhraseNotes yet</Text>
              <Text style={styles.emptySubtext}>
                Share a PhraseNote from the Player to start
              </Text>
            </View>
          ) : (
            <View style={styles.notesList}>
              {notes.map((note) => (
                <View key={note.id} style={styles.noteCard}>
                  <View style={styles.noteHeader}>
                    <View style={styles.avatar}>
                      <Ionicons name="person" size={14} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.noteName}>
                      {note.profile?.displayName || 'Dancer'}
                    </Text>
                    <Text style={styles.noteDate}>
                      {new Date(note.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {note.description ? (
                    <Text style={styles.noteDescription}>{note.description}</Text>
                  ) : null}
                  <View style={styles.notePreview}>
                    <Ionicons name={note.phraseNoteData?.format === 'cnote' ? 'people' : 'musical-note'} size={16} color={note.phraseNoteData?.format === 'cnote' ? NoteTypeColors.choreoNote : NoteTypeColors.phraseNote} />
                    <Text style={[styles.notePreviewText, { color: note.phraseNoteData?.format === 'cnote' ? NoteTypeColors.choreoNote : NoteTypeColors.phraseNote }]}>{note.phraseNoteData?.format === 'cnote' ? 'ChoreoNote' : 'PhraseNote'} attached</Text>
                    <TouchableOpacity
                      style={styles.importBtn}
                      onPress={() => handleImportNote(note.phraseNoteData, note.profile?.displayName, note.profile?.avatarUrl)}
                    >
                      <Ionicons name="download-outline" size={16} color={Colors.primary} />
                      <Text style={styles.importBtnText}>Import</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  // Header
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBpm: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  // Thread info
  threadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  threadInfoText: {
    flex: 1,
    gap: 2,
  },
  threadTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  threadMeta: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  emptyText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  // Notes list
  notesList: {
    gap: 10,
  },
  noteCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.sm,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noteName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  noteDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  noteDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    paddingLeft: 36,
  },
  notePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginLeft: 36,
  },
  notePreviewText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  importBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
});
