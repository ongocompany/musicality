import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { useSocialStore } from '../../stores/socialStore';
import type { UserFollow } from '../../types/community';

interface Props {
  visible: boolean;
  userId: string;
  initialTab?: 'followers' | 'following';
  onClose: () => void;
  onUserPress: (userId: string) => void;
}

export default function FollowListModal({
  visible,
  userId,
  initialTab = 'followers',
  onClose,
  onUserPress,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'followers' | 'following'>(initialTab);
  const { followers, following, followListLoading, fetchFollowers, fetchFollowing } = useSocialStore();

  useEffect(() => {
    if (!visible) return;
    setTab(initialTab);
    if (initialTab === 'followers') {
      fetchFollowers(userId);
    } else {
      fetchFollowing(userId);
    }
  }, [visible, userId, initialTab]);

  const handleTabChange = (newTab: 'followers' | 'following') => {
    setTab(newTab);
    if (newTab === 'followers') {
      fetchFollowers(userId);
    } else {
      fetchFollowing(userId);
    }
  };

  const data = tab === 'followers' ? followers : following;

  const renderItem = ({ item }: { item: UserFollow }) => {
    const profile = item.profile;
    if (!profile) return null;

    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => {
          onClose();
          onUserPress(profile.id);
        }}
      >
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={18} color={Colors.textMuted} />
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.displayName} numberOfLines={1}>{profile.displayName}</Text>
          {profile.nickname && (
            <Text style={styles.nickname}>@{profile.nickname}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {tab === 'followers' ? t('community.followers') : t('community.following')}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, tab === 'followers' && styles.tabActive]}
              onPress={() => handleTabChange('followers')}
            >
              <Text style={[styles.tabText, tab === 'followers' && styles.tabTextActive]}>
                {t('community.followers')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'following' && styles.tabActive]}
              onPress={() => handleTabChange('following')}
            >
              <Text style={[styles.tabText, tab === 'following' && styles.tabTextActive]}>
                {t('community.following')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          {followListLoading ? (
            <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} />
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {tab === 'followers' ? t('community.noFollowers') : t('community.noFollowing')}
                </Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.primary,
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  displayName: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  nickname: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: 1,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
