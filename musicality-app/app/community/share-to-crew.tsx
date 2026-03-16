import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCommunityStore } from '../../stores/communityStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import type { Crew, SongThread } from '../../types/community';

type Step = 'crew' | 'thread' | 'confirm';

export default function ShareToCrewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    phraseNoteData?: string;
    songTitle?: string;
    bpm?: string;
    danceStyle?: string;
    noteType?: string;
  }>();
  const noteLabel = params.noteType === 'cnote' ? 'ChoreoNote' : 'PhraseNote';

  const {
    myCrewIds,
    crewCache,
    activeSongThreads,
    loading,
    fetchMyCrews,
    fetchSongThreads,
    createSongThread,
    postPhraseNote,
  } = useCommunityStore();

  const [step, setStep] = useState<Step>('crew');
  const [selectedCrew, setSelectedCrew] = useState<Crew | null>(null);
  const [selectedThread, setSelectedThread] = useState<SongThread | null>(null);
  const [newThreadTitle, setNewThreadTitle] = useState(params.songTitle ?? '');
  const [description, setDescription] = useState('');
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const myCrews = myCrewIds.map((id) => crewCache[id]).filter(Boolean);

  useEffect(() => {
    fetchMyCrews();
  }, []);

  const handleSelectCrew = (crew: Crew) => {
    setSelectedCrew(crew);
    fetchSongThreads(crew.id);
    setStep('thread');
  };

  const handleSelectThread = (thread: SongThread) => {
    setSelectedThread(thread);
    setStep('confirm');
  };

  const handleCreateNewThread = async () => {
    if (!selectedCrew || !newThreadTitle.trim()) return;
    setIsCreatingThread(true);
    try {
      const threadId = await createSongThread(selectedCrew.id, {
        title: newThreadTitle.trim(),
        bpm: params.bpm ? parseFloat(params.bpm) : undefined,
        danceStyle: params.danceStyle || 'bachata',
      });
      // Find the newly created thread
      const newThread = activeSongThreads.find((t) => t.id === threadId);
      if (newThread) {
        setSelectedThread(newThread);
        setStep('confirm');
      } else {
        // Thread created but not in the list yet, proceed anyway
        setSelectedThread({ id: threadId, title: newThreadTitle.trim() } as SongThread);
        setStep('confirm');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create thread');
    } finally {
      setIsCreatingThread(false);
    }
  };

  const handlePost = async () => {
    if (!selectedThread || !params.phraseNoteData) {
      Alert.alert('Error', `Missing ${noteLabel} data`);
      return;
    }
    setIsPosting(true);
    try {
      const noteData = JSON.parse(params.phraseNoteData);
      await postPhraseNote(selectedThread.id, noteData, description.trim() || undefined);
      Alert.alert('Shared!', `${noteLabel} posted to "${selectedThread.title}"`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to post');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: step === 'crew' ? 'Select Crew' : step === 'thread' ? 'Select Thread' : `Share ${noteLabel}`,
          presentation: 'modal',
        }}
      />
      <View style={styles.container}>
        {/* Step indicator */}
        <View style={styles.stepBar}>
          {(['crew', 'thread', 'confirm'] as Step[]).map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, (step === s || i < ['crew', 'thread', 'confirm'].indexOf(step)) && styles.stepDotActive]} />
              <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>
                {s === 'crew' ? 'Crew' : s === 'thread' ? 'Thread' : 'Post'}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          {/* Step 1: Select crew */}
          {step === 'crew' && (
            <>
              {myCrews.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No crews yet</Text>
                  <Text style={styles.emptySubtext}>Join or create a crew first</Text>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => router.replace('/community/create-crew')}
                  >
                    <Text style={styles.actionBtnText}>Create Crew</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.list}>
                  {myCrews.map((crew) => (
                    <TouchableOpacity
                      key={crew.id}
                      style={styles.listItem}
                      onPress={() => handleSelectCrew(crew)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.listIcon}>
                        <Ionicons name="people" size={20} color={Colors.primary} />
                      </View>
                      <View style={styles.listInfo}>
                        <Text style={styles.listTitle}>{crew.name}</Text>
                        <Text style={styles.listMeta}>
                          {crew.memberCount} members · {crew.danceStyle}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Step 2: Select or create thread */}
          {step === 'thread' && selectedCrew && (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setStep('crew')}>
                <Ionicons name="arrow-back" size={16} color={Colors.primary} />
                <Text style={styles.backText}>{selectedCrew.name}</Text>
              </TouchableOpacity>

              {/* Create new thread */}
              <View style={styles.newThreadBox}>
                <Text style={styles.newThreadLabel}>New Song Thread</Text>
                <View style={styles.newThreadRow}>
                  <TextInput
                    style={styles.newThreadInput}
                    value={newThreadTitle}
                    onChangeText={setNewThreadTitle}
                    placeholder="Song title..."
                    placeholderTextColor={Colors.textMuted}
                    maxLength={100}
                  />
                  <TouchableOpacity
                    style={[styles.newThreadBtn, !newThreadTitle.trim() && styles.btnDisabled]}
                    onPress={handleCreateNewThread}
                    disabled={!newThreadTitle.trim() || isCreatingThread}
                  >
                    {isCreatingThread ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name="add" size={20} color="#FFF" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Existing threads */}
              {loading.songThreads ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing.lg }} />
              ) : activeSongThreads.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptySubtext}>No existing threads — create one above</Text>
                </View>
              ) : (
                <View style={styles.list}>
                  <Text style={styles.listHeader}>Existing Threads</Text>
                  {activeSongThreads.map((thread) => (
                    <TouchableOpacity
                      key={thread.id}
                      style={styles.listItem}
                      onPress={() => handleSelectThread(thread)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.listIcon}>
                        <Ionicons name="musical-note" size={18} color={Colors.primary} />
                      </View>
                      <View style={styles.listInfo}>
                        <Text style={styles.listTitle}>{thread.title}</Text>
                        <Text style={styles.listMeta}>
                          {thread.postCount} note{thread.postCount !== 1 ? 's' : ''}
                          {thread.bpm ? ` · ${thread.bpm} BPM` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Step 3: Confirm & post */}
          {step === 'confirm' && selectedCrew && selectedThread && (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setStep('thread')}>
                <Ionicons name="arrow-back" size={16} color={Colors.primary} />
                <Text style={styles.backText}>Back to threads</Text>
              </TouchableOpacity>

              <View style={styles.confirmCard}>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Crew</Text>
                  <Text style={styles.confirmValue}>{selectedCrew.name}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Thread</Text>
                  <Text style={styles.confirmValue}>{selectedThread.title}</Text>
                </View>
              </View>

              <View style={styles.descField}>
                <Text style={styles.descLabel}>Add a note (optional)</Text>
                <TextInput
                  style={styles.descInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Basic step variation for beginners"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={300}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </>
          )}

          {/* Post button */}
          {step === 'confirm' && (
            <TouchableOpacity
              style={[styles.postButton, isPosting && styles.btnDisabled]}
              onPress={handlePost}
              disabled={isPosting}
              activeOpacity={0.8}
            >
              {isPosting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={20} color="#FFF" />
                  <Text style={styles.postButtonText}>Share {noteLabel}</Text>
                </>
              )}
            </TouchableOpacity>
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
  // Step bar
  stepBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  stepLabelActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  // Back row
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4,
  },
  backText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  // Empty
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
  actionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  actionBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  // List
  list: {
    gap: 8,
  },
  listHeader: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listInfo: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  listMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  // New thread
  newThreadBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.sm,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  newThreadLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  newThreadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  newThreadInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  newThreadBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  // Confirm
  confirmCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.sm,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  confirmValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    maxWidth: '60%',
    textAlign: 'right',
  },
  descField: {
    gap: 6,
  },
  descLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  descInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  postButton: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  postButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: '#FFF',
  },
});
