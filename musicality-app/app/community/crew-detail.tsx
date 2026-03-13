import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useCommunityStore } from '../../stores/communityStore';
import { useCalendarStore } from '../../stores/calendarStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import EventCard from '../../components/calendar/EventCard';
import EventFormModal from '../../components/calendar/EventFormModal';
import type { CrewMember } from '../../types/community';
import type { CalendarEvent, CreateEventInput } from '../../types/calendar';

type Tab = 'songs' | 'board' | 'members' | 'calendar';

export default function CrewDetailScreen() {
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
        Alert.alert('Joined!', `Welcome to ${crew.name}!`);
      } else {
        await requestJoinCrew(id);
        Alert.alert('Request Sent', 'The captain will review your request.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to join');
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
          <Text style={styles.emptyText}>Loading crew...</Text>
        </View>
      </>
    );
  }

  const pendingCount = activePendingRequests.length;

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
            <View style={styles.memberCountBox}>
              <Text style={styles.memberCountNumber}>{crew.memberCount}</Text>
              <Text style={styles.memberCountLabel}>/{crew.memberLimit}</Text>
            </View>
          </View>

          {/* Join button (non-members only) */}
          {!isMember && (
            <TouchableOpacity style={styles.joinButton} onPress={handleJoin} activeOpacity={0.8}>
              <Ionicons name={crew.crewType === 'open' ? 'enter-outline' : 'hand-left-outline'} size={18} color="#FFF" />
              <Text style={styles.joinButtonText}>
                {crew.crewType === 'open' ? 'Join Crew' : 'Request to Join'}
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
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tab Content */}
            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={styles.tabContentInner}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
              }
            >
              {activeTab === 'songs' && (
                <>
                  {activeSongThreads.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="musical-notes-outline" size={40} color={Colors.textMuted} />
                      <Text style={styles.emptyText}>No songs yet</Text>
                      <Text style={styles.emptySubtext}>Share a PhraseNote from the Player to start a thread</Text>
                    </View>
                  ) : (
                    activeSongThreads.map((thread) => (
                      <TouchableOpacity
                        key={thread.id}
                        style={styles.threadCard}
                        onPress={() => router.push({ pathname: '/community/song-thread', params: { id: thread.id, crewId: id! } })}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="musical-note" size={20} color={Colors.primary} />
                        <View style={styles.threadInfo}>
                          <Text style={styles.threadTitle} numberOfLines={1}>{thread.title}</Text>
                          <Text style={styles.threadMeta}>
                            {thread.postCount} note{thread.postCount !== 1 ? 's' : ''}
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
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>General Board</Text>
                  <Text style={styles.emptySubtext}>Coming in the next update</Text>
                </View>
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
                      <Text style={styles.addEventText}>일정 추가</Text>
                    </TouchableOpacity>
                  )}
                  {crewEvents.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
                      <Text style={styles.emptyText}>일정이 없습니다</Text>
                      <Text style={styles.emptySubtext}>캡틴이나 모더레이터가 일정을 추가할 수 있습니다</Text>
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
                            Alert.alert('일정 삭제', '이 일정을 삭제하시겠습니까?', [
                              { text: '취소', style: 'cancel' },
                              { text: '삭제', style: 'destructive', onPress: () => deleteCrewEventAction(eventId) },
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
                            <Text style={styles.captainBadgeText}>Captain</Text>
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
