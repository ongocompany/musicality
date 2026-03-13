import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { useSocialStore } from '../../stores/socialStore';
import { useAuthStore } from '../../stores/authStore';
import UserProfileCard from '../../components/social/UserProfileCard';
import FollowListModal from '../../components/social/FollowListModal';
import UserNoteModal from '../../components/social/UserNoteModal';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    viewingProfile,
    viewingSocialContext,
    viewingLoading,
    fetchUserProfile,
    fetchSocialContext,
    toggleFollow,
    toggleBlock,
    upsertNote,
    deleteNote,
    clearViewing,
  } = useSocialStore();

  const [followListVisible, setFollowListVisible] = useState(false);
  const [followListTab, setFollowListTab] = useState<'followers' | 'following'>('followers');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserProfile(userId);
      fetchSocialContext(userId);
    }
    return () => clearViewing();
  }, [userId]);

  const handleFollowToggle = async () => {
    if (!userId) return;
    setFollowLoading(true);
    try {
      await toggleFollow(userId);
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '팔로우 처리에 실패했습니다');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBlock = () => {
    if (!userId) return;
    const isBlocked = viewingSocialContext?.isBlocked;

    if (isBlocked) {
      // Unblock
      Alert.alert('차단 해제', `${viewingProfile?.displayName}님의 차단을 해제하시겠습니까?`, [
        { text: '취소', style: 'cancel' },
        {
          text: '해제',
          onPress: async () => {
            try {
              await toggleBlock(userId);
            } catch (e: any) {
              Alert.alert('오류', e.message);
            }
          },
        },
      ]);
    } else {
      // Block with warning
      Alert.alert(
        '사용자 차단',
        `${viewingProfile?.displayName}님을 차단하시겠습니까?\n\n차단하면 서로의 팔로우가 자동으로 해제됩니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '차단',
            style: 'destructive',
            onPress: async () => {
              try {
                await toggleBlock(userId);
              } catch (e: any) {
                Alert.alert('오류', e.message);
              }
            },
          },
        ],
      );
    }
  };

  const handleDM = () => {
    if (!viewingProfile) return;
    router.push({
      pathname: '/messages/conversation',
      params: {
        userId: viewingProfile.id,
        name: viewingProfile.displayName,
      },
    });
  };

  const handleFollowersTap = () => {
    setFollowListTab('followers');
    setFollowListVisible(true);
  };

  const handleFollowingTap = () => {
    setFollowListTab('following');
    setFollowListVisible(true);
  };

  const handleUserPress = (targetUserId: string) => {
    router.push(`/profile/${targetUserId}`);
  };

  if (viewingLoading || !viewingProfile) {
    return (
      <View style={[styles.container, styles.center]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>프로필</Text>
          <View style={{ width: 24 }} />
        </View>
        {viewingLoading && <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{viewingProfile.displayName}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Profile Card */}
      <UserProfileCard
        profile={viewingProfile}
        socialContext={viewingSocialContext}
        isOwnProfile={user?.id === viewingProfile.id}
        onFollowToggle={handleFollowToggle}
        onDM={handleDM}
        onNote={() => setNoteModalVisible(true)}
        onBlock={handleBlock}
        onFollowersTap={handleFollowersTap}
        onFollowingTap={handleFollowingTap}
        followLoading={followLoading}
      />

      {/* Note display (if exists) */}
      {viewingSocialContext?.note && (
        <TouchableOpacity
          style={styles.noteCard}
          onPress={() => setNoteModalVisible(true)}
        >
          <Ionicons name="document-text" size={16} color={Colors.accent} />
          <Text style={styles.noteText} numberOfLines={3}>
            {viewingSocialContext.note.content}
          </Text>
        </TouchableOpacity>
      )}

      {/* Follow List Modal */}
      <FollowListModal
        visible={followListVisible}
        userId={viewingProfile.id}
        initialTab={followListTab}
        onClose={() => setFollowListVisible(false)}
        onUserPress={handleUserPress}
      />

      {/* Note Modal */}
      <UserNoteModal
        visible={noteModalVisible}
        initialContent={viewingSocialContext?.note?.content ?? ''}
        targetName={viewingProfile.displayName}
        onSave={async (content) => {
          if (userId) await upsertNote(userId, content);
        }}
        onDelete={async () => {
          if (userId) await deleteNote(userId);
        }}
        onClose={() => setNoteModalVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  noteText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
});
