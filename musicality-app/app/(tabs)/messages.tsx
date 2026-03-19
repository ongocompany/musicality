import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Modal,
  Pressable,
  Image,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { useMessageStore } from '../../stores/messageStore';
import { useCommunityStore } from '../../stores/communityStore';
import { useSocialStore } from '../../stores/socialStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import InboxItemComponent from '../../components/messages/InboxItem';
import type { InboxItem } from '../../types/message';

const POLL_INTERVAL = 10_000;

export default function MessagesScreen() {
  const router = useRouter();
  const { user, guestMode } = useAuthStore();
  const { inboxItems, loading, fetchInbox, fetchUnreadCount } = useMessageStore();
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAuthenticated = user !== null;
  const [showNewMsg, setShowNewMsg] = useState(false);
  const { activeCrewMembers } = useCommunityStore();
  const { following } = useSocialStore();

  // Initial fetch + polling
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchInbox();
    fetchUnreadCount();
    if (user?.id) useSocialStore.getState().fetchFollowing(user.id);

    pollRef.current = setInterval(() => {
      fetchInbox();
      fetchUnreadCount();
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAuthenticated]);

  // Refresh on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated) {
        fetchInbox();
        fetchUnreadCount();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInbox();
    await fetchUnreadCount();
    setRefreshing(false);
  }, []);

  const handleItemPress = (item: InboxItem) => {
    if (item.type === 'dm' && item.otherUserId) {
      router.push({
        pathname: '/messages/conversation',
        params: {
          userId: item.otherUserId,
          name: item.otherProfile?.displayName ?? '',
          avatarUrl: item.otherProfile?.avatarUrl ?? '',
        },
      });
    } else if (item.type === 'room' && item.room) {
      router.push({
        pathname: '/messages/room',
        params: {
          roomId: item.room.id,
          name: item.room.name ?? '그룹 채팅',
        },
      });
    }
  };

  // Guest mode
  if (!isAuthenticated && guestMode) {
    return (
      <View style={styles.container}>
        <View style={styles.guestCard}>
          <Ionicons name="chatbubbles" size={64} color={Colors.textMuted} />
          <Text style={styles.guestTitle}>Messages</Text>
          <Text style={styles.guestDesc}>
            Sign in to chat with other dancers
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => useAuthStore.getState().signOut()}
            activeOpacity={0.8}
          >
            <Ionicons name="log-in-outline" size={20} color="#FFF" />
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleStartChat = (userId: string, name: string, avatarUrl?: string) => {
    setShowNewMsg(false);
    router.push({
      pathname: '/messages/conversation',
      params: { userId, name, avatarUrl: avatarUrl ?? '' },
    });
  };

  const handleAvatarPress = (userId: string) => {
    router.push(`/profile/${userId}`);
  };

  const renderItem = ({ item }: { item: InboxItem }) => (
    <InboxItemComponent
      item={item}
      onPress={() => handleItemPress(item)}
      onAvatarPress={handleAvatarPress}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={() => setShowNewMsg(true)} hitSlop={8}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={inboxItems}
        keyExtractor={(item, idx) =>
          item.type === 'dm'
            ? `dm-${item.otherUserId}`
            : `room-${item.room?.id ?? idx}`
        }
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={inboxItems.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          loading.inbox ? null : (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>메시지가 없습니다</Text>
              <Text style={styles.emptySubtext}>
                크루 멤버에게 메시지를 보내보세요
              </Text>
            </View>
          )
        }
      />

      {/* New message modal */}
      <Modal visible={showNewMsg} transparent animationType="slide" onRequestClose={() => setShowNewMsg(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowNewMsg(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>새 메시지</Text>
              <TouchableOpacity onPress={() => setShowNewMsg(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Crew members */}
            {activeCrewMembers.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>크루 멤버</Text>
                {activeCrewMembers
                  .filter(m => m.userId !== user?.id)
                  .map(m => {
                    const name = m.profile?.displayName || m.profile?.nickname || 'Dancer';
                    const avatar = m.profile?.avatarUrl;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.contactItem}
                        onPress={() => handleStartChat(m.userId, name, avatar ?? undefined)}
                      >
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={styles.contactAvatar} />
                        ) : (
                          <View style={[styles.contactAvatar, styles.contactAvatarPlaceholder]}>
                            <Ionicons name="person" size={16} color={Colors.textMuted} />
                          </View>
                        )}
                        <Text style={styles.contactName}>{name}</Text>
                        <Ionicons name="chatbubble-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}

            {/* Following */}
            {following.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>팔로잉</Text>
                {following
                  .filter(f => f.followingId !== user?.id)
                  .slice(0, 20)
                  .map(f => {
                    const name = (f as any).followingProfile?.displayName || 'User';
                    const avatar = (f as any).followingProfile?.avatarUrl;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={styles.contactItem}
                        onPress={() => handleStartChat(f.followingId, name, avatar)}
                      >
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={styles.contactAvatar} />
                        ) : (
                          <View style={[styles.contactAvatar, styles.contactAvatarPlaceholder]}>
                            <Ionicons name="person" size={16} color={Colors.textMuted} />
                          </View>
                        )}
                        <Text style={styles.contactName}>{name}</Text>
                        <Ionicons name="chatbubble-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}

            {activeCrewMembers.length === 0 && following.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>크루에 가입하거나 다른 댄서를 팔로우해보세요</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
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
  guestCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 12,
  },
  guestTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  guestDesc: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  signInButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: '#FFF',
  },
  // New message modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Spacing.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSection: {
    marginBottom: Spacing.md,
  },
  modalSectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  contactAvatarPlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
  },
});
