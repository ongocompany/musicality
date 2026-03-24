import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useCommunityStore } from '../../stores/communityStore';
import { useCalendarStore } from '../../stores/calendarStore';
import { Colors, Spacing, FontSize, NoteTypeColors } from '../../constants/theme';
import EventCard from '../../components/calendar/EventCard';
import EventFormModal from '../../components/calendar/EventFormModal';
import PostComposer from '../../components/board/PostComposer';
import PostItem from '../../components/board/PostItem';
import { Image } from 'react-native';
import type { CrewMember } from '../../types/community';
import type { CalendarEvent, CreateEventInput } from '../../types/calendar';

type Tab = 'songs' | 'board' | 'members' | 'calendar';

export default function CrewDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const {
    crewCache,
    activeCrewMembers,
    activeSongThreads,
    activeGeneralPosts,
    activePendingRequests,
    loading,
    myCrewIds,
    fetchCrewDetail,
    fetchCrewMembers,
    fetchSongThreads,
    fetchGeneralPosts,
    createGeneralPost,
    deleteGeneralPost,
    togglePostLike,
    fetchPostReplies,
    fetchJoinRequests,
    joinCrew,
    requestJoinCrew,
    setActiveCrew,
  } = useCommunityStore();

  const {
    crewEvents,
    savedEventIds,
    fetchCrewEvents,
    fetchSavedEventIds,
    createCrewEvent,
    updateCrewEvent,
    deleteCrewEvent: deleteCrewEventAction,
    toggleSaveEvent,
    setMonth,
    currentYear,
    currentMonth,
  } = useCalendarStore();

  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [refreshing, setRefreshing] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const crew = id ? crewCache[id] : undefined;
  const isMember = id ? myCrewIds.includes(id) : false;
  const isCaptain = crew?.captainId === user?.id;

  useEffect(() => {
    if (!id) return;
    setActiveCrew(id);
    fetchCrewDetail(id);
    fetchCrewMembers(id);
    fetchSongThreads(id);
    if (isCaptain) fetchJoinRequests(id);
    return () => setActiveCrew(null);
  }, [id]);

  const onRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await Promise.all([
      fetchCrewDetail(id),
      fetchCrewMembers(id),
      activeTab === 'songs' ? fetchSongThreads(id)
        : activeTab === 'calendar' ? fetchCrewEvents(id)
        : fetchGeneralPosts(id),
    ]);
    setRefreshing(false);
  }, [id, activeTab]);

  const handleJoin = async () => {
    if (!id || !crew) return;
    try {
      if (crew.crewType === 'open') {
        await joinCrew(id);
        Alert.alert(t('crew.joined'), t('crew.welcomeTo', { name: crew.name }));
      } else {
        await requestJoinCrew(id);
        Alert.alert(t('crew.requestSent'), t('crew.requestSentDesc'));
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('crew.joinFailed'));
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (!id) return;
    if (tab === 'songs') fetchSongThreads(id);
    else if (tab === 'board') fetchGeneralPosts(id);
    else if (tab === 'calendar') { fetchCrewEvents(id); fetchSavedEventIds(); }
    else fetchCrewMembers(id);
  };

  if (!crew) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={styles.emptyText}>{t('crew.loadingCrew')}</Text>
        </View>
      </>
    );
  }

  // ─── Search filter ─────────────────────────────────
  const isSearching = searchQuery.trim().length > 0;
  const filteredSongs = useMemo(() => {
    if (!isSearching) return activeSongThreads;
    const q = searchQuery.trim().toLowerCase();
    return activeSongThreads.filter(t =>
      t.title.toLowerCase().includes(q)
    );
  }, [activeSongThreads, searchQuery, isSearching]);

  const filteredPosts = useMemo(() => {
    if (!isSearching) return activeGeneralPosts;
    const q = searchQuery.trim().toLowerCase();
    return activeGeneralPosts.filter(p =>
      p.content.toLowerCase().includes(q) ||
      (p.profile?.displayName?.toLowerCase().includes(q))
    );
  }, [activeGeneralPosts, searchQuery, isSearching]);

  // Ensure both songs & board data are loaded for cross-tab search
  useEffect(() => {
    if (!id || !isSearching) return;
    if (activeSongThreads.length === 0) fetchSongThreads(id);
    if (activeGeneralPosts.length === 0) fetchGeneralPosts(id);
  }, [id, isSearching]);

  const pendingCount = activePendingRequests.length;
  const captainMember = activeCrewMembers.find(m => m.role === 'captain');
  const captainAvatarUrl = captainMember?.profile?.avatarUrl;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Custom Header */}
      <View style={[styles.customHeader, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{crew.name}</Text>
        {isMember ? (
          <TouchableOpacity
            onPress={() => {
              if (isCaptain) {
                router.push({ pathname: '/community/manage-crew', params: { id: id! } });
              } else {
                router.push({ pathname: '/community/member-settings', params: { id: id! } });
              }
            }}
            style={styles.headerButton}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.text} />
            {isCaptain && pendingCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>
      <View style={styles.container}>
        {/* Crew Info Header */}
        <View style={styles.infoHeader}>
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Text style={styles.crewName}>{crew.name}</Text>
              {crew.description ? (
                <Text style={styles.crewDesc} numberOfLines={2}>{crew.description}</Text>
              ) : null}
            </View>
            <View style={styles.infoRight}>
              {/* Captain avatar */}
              <TouchableOpacity
                style={styles.captainAvatar}
                onPress={() => captainMember && router.push(`/profile/${captainMember.userId}`)}
                activeOpacity={captainMember ? 0.7 : 1}
              >
                {captainAvatarUrl ? (
                  <Image source={{ uri: captainAvatarUrl }} style={styles.captainAvatarImage} />
                ) : (
                  <Ionicons name="shield" size={18} color={Colors.warning} />
                )}
              </TouchableOpacity>
              {/* Member count */}
              <View style={styles.memberCountBox}>
                <Text style={styles.memberCountNumber}>{crew.memberCount}</Text>
                <Text style={styles.memberCountLabel}>/{crew.memberLimit}</Text>
              </View>
            </View>
          </View>

          {/* Join button (non-members only) */}
          {!isMember && (
            <TouchableOpacity style={styles.joinButton} onPress={handleJoin} activeOpacity={0.8}>
              <Ionicons name={crew.crewType === 'open' ? 'enter-outline' : 'hand-left-outline'} size={18} color="#FFF" />
              <Text style={styles.joinButtonText}>
                {crew.crewType === 'open' ? t('crew.joinCrew') : t('crew.requestToJoin')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Bar */}
        {isMember && (
          <>
            <View style={styles.tabBar}>
              {(['songs', 'board', 'calendar', 'members'] as Tab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeTab === tab && styles.tabActive]}
                  onPress={() => handleTabChange(tab)}
                >
                  <Ionicons
                    name={tab === 'songs' ? 'musical-notes-outline' : tab === 'board' ? 'chatbubbles-outline' : tab === 'calendar' ? 'calendar-outline' : 'people-outline'}
                    size={18}
                    color={activeTab === tab ? Colors.primary : Colors.textMuted}
                  />
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                    {t(`crew.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Bar */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('crew.searchPlaceholder')}
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

            {/* Tab Content */}
            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={styles.tabContentInner}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
              }
            >
              {/* ─── Search Results (cross-tab) ─── */}
              {isSearching ? (
                <>
                  {/* Songs section */}
                  <Text style={styles.searchSectionLabel}>
                    <Ionicons name="musical-notes" size={14} color={NoteTypeColors.phraseNote} />
                    {' '}{t('crew.tabSongs')} ({filteredSongs.length})
                  </Text>
                  {filteredSongs.length === 0 ? (
                    <Text style={styles.searchNoResult}>{t('crew.noSearchResults')}</Text>
                  ) : (
                    filteredSongs.map((thread) => (
                      <TouchableOpacity
                        key={thread.id}
                        style={styles.threadCard}
                        onPress={() => router.push({ pathname: '/community/song-thread', params: { id: thread.id, crewId: id! } })}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={thread.latestNoteFormat === 'cnote' ? 'people' : 'musical-note'} size={20} color={thread.latestNoteFormat === 'cnote' ? NoteTypeColors.choreoNote : NoteTypeColors.phraseNote} />
                        <View style={styles.threadInfo}>
                          <Text style={styles.threadTitle} numberOfLines={1}>{thread.title}</Text>
                          <Text style={styles.threadMeta}>
                            {t('crew.noteCount', { count: thread.postCount })}
                            {thread.bpm ? ` · ${thread.bpm} BPM` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ))
                  )}

                  {/* Board section */}
                  <Text style={[styles.searchSectionLabel, { marginTop: Spacing.md }]}>
                    <Ionicons name="chatbubbles" size={14} color={Colors.primary} />
                    {' '}{t('crew.tabBoard')} ({filteredPosts.length})
                  </Text>
                  {filteredPosts.length === 0 ? (
                    <Text style={styles.searchNoResult}>{t('crew.noSearchResults')}</Text>
                  ) : (
                    filteredPosts.map((post) => (
                      <PostItem
                        key={post.id}
                        post={post}
                        currentUserId={user?.id}
                        onLike={togglePostLike}
                        onDelete={async (postId) => { await deleteGeneralPost(postId); }}
                        onReply={async (parentId, content) => {
                          if (!id) return;
                          await createGeneralPost(id, content, parentId);
                        }}
                        onFetchReplies={fetchPostReplies}
                      />
                    ))
                  )}
                </>
              ) : (
              <>
              {activeTab === 'songs' && (
                <>
                  {activeSongThreads.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="musical-notes-outline" size={40} color={Colors.textMuted} />
                      <Text style={styles.emptyText}>{t('crew.noSongs')}</Text>
                      <Text style={styles.emptySubtext}>{t('crew.shareNote')}</Text>
                    </View>
                  ) : (
                    activeSongThreads.map((thread) => (
                      <TouchableOpacity
                        key={thread.id}
                        style={styles.threadCard}
                        onPress={() => router.push({ pathname: '/community/song-thread', params: { id: thread.id, crewId: id! } })}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={thread.latestNoteFormat === 'cnote' ? 'people' : 'musical-note'} size={20} color={thread.latestNoteFormat === 'cnote' ? NoteTypeColors.choreoNote : NoteTypeColors.phraseNote} />
                        <View style={styles.threadInfo}>
                          <Text style={styles.threadTitle} numberOfLines={1}>{thread.title}</Text>
                          <Text style={styles.threadMeta}>
                            {t('crew.noteCount', { count: thread.postCount })}
                            {thread.bpm ? ` · ${thread.bpm} BPM` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}

              {activeTab === 'board' && (
                <>
                  <PostComposer
                    onPost={async (content, mediaUrls) => {
                      if (!id) return;
                      await createGeneralPost(id, content, undefined, mediaUrls);
                    }}
                  />
                  {activeGeneralPosts.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
                      <Text style={styles.emptyText}>{t('crew.noPosts')}</Text>
                      <Text style={styles.emptySubtext}>{t('crew.writeFirstPost')}</Text>
                    </View>
                  ) : (
                    activeGeneralPosts.map((post) => (
                      <PostItem
                        key={post.id}
                        post={post}
                        currentUserId={user?.id}
                        onLike={togglePostLike}
                        onDelete={async (postId) => { await deleteGeneralPost(postId); }}
                        onReply={async (parentId, content) => {
                          if (!id) return;
                          await createGeneralPost(id, content, parentId);
                        }}
                        onFetchReplies={fetchPostReplies}
                      />
                    ))
                  )}
                </>
              )}

              {activeTab === 'calendar' && (
                <>
                  {(isCaptain || activeCrewMembers.some(m => m.userId === user?.id && (m.role === 'captain' || m.role === 'moderator'))) && (
                    <TouchableOpacity
                      style={styles.addEventButton}
                      onPress={() => { setEditingEvent(null); setShowEventForm(true); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                      <Text style={styles.addEventText}>{t('crew.addEvent')}</Text>
                    </TouchableOpacity>
                  )}
                  {crewEvents.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
                      <Text style={styles.emptyText}>{t('crew.noEvents')}</Text>
                      <Text style={styles.emptySubtext}>{t('crew.noEventsHint')}</Text>
                    </View>
                  ) : (
                    crewEvents.map((event) => {
                      const canManage = isCaptain || activeCrewMembers.some(m => m.userId === user?.id && m.role === 'moderator');
                      return (
                        <EventCard
                          key={event.id}
                          event={event}
                          canEdit={canManage}
                          isSaved={savedEventIds.has(event.id)}
                          onEdit={canManage ? (e) => { setEditingEvent(e); setShowEventForm(true); } : undefined}
                          onDelete={canManage ? (eventId) => {
                            Alert.alert(t('crew.deleteEvent'), t('crew.deleteEventConfirm'), [
                              { text: t('common.cancel'), style: 'cancel' },
                              { text: t('common.delete'), style: 'destructive', onPress: () => deleteCrewEventAction(eventId) },
                            ]);
                          } : undefined}
                          onToggleSave={(eventId) => toggleSaveEvent(eventId)}
                        />
                      );
                    })
                  )}
                </>
              )}

              {activeTab === 'members' && (
                <>
                  {activeCrewMembers.map((member) => (
                    <TouchableOpacity
                      key={member.id}
                      style={styles.memberRow}
                      onPress={() => {
                        if (member.userId !== user?.id) {
                          router.push(`/profile/${member.userId}`);
                        }
                      }}
                      activeOpacity={member.userId === user?.id ? 1 : 0.7}
                    >
                      <View style={styles.avatar}>
                        <Ionicons name="person" size={18} color={Colors.textMuted} />
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                          {member.profile?.displayName || 'Dancer'}
                        </Text>
                        {member.role === 'captain' && (
                          <View style={styles.captainBadge}>
                            <Text style={styles.captainBadgeText}>{t('crew.captain')}</Text>
                          </View>
                        )}
                      </View>
                      {member.userId !== user?.id && (
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              </>
              )}
            </ScrollView>
          </>
        )}
      </View>

      {/* Crew Event Form Modal */}
      <EventFormModal
        visible={showEventForm}
        editEvent={editingEvent}
        onSubmit={async (input: CreateEventInput) => {
          if (!id) return;
          if (editingEvent) {
            await updateCrewEvent(editingEvent.id, input);
            await fetchCrewEvents(id);
          } else {
            await createCrewEvent(id, input);
          }
        }}
        onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  // Info Header
  infoHeader: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLeft: {
    flex: 1,
    gap: 4,
  },
  crewName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  crewDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  infoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captainAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.warning,
  },
  captainAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  memberCountBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  memberCountNumber: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.primary,
  },
  memberCountLabel: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 40,
    borderRadius: 10,
    gap: 6,
  },
  joinButtonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 5,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: Colors.primary,
  },
  // Search Bar
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
  searchSectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  searchNoResult: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    paddingVertical: Spacing.sm,
    textAlign: 'center',
  },
  // Tab Content
  tabContent: {
    flex: 1,
  },
  tabContentInner: {
    padding: Spacing.md,
    gap: 10,
    paddingBottom: Spacing.xxl,
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
  // Song Thread Card
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  threadInfo: {
    flex: 1,
    gap: 2,
  },
  threadTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  threadMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  // Member Row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  captainBadge: {
    backgroundColor: Colors.warning + '30',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  captainBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.warning,
  },
  // Badge (notification dot)
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: Colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  // Calendar
  addEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addEventText: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.primary,
  },
});
