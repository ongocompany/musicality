import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { formatRelativeTime } from '../../utils/timeFormat';
import type { InboxItem as InboxItemType } from '../../types/message';

interface Props {
  item: InboxItemType;
  onPress: () => void;
  onAvatarPress?: (userId: string) => void;
}

export default function InboxItem({ item, onPress, onAvatarPress }: Props) {
  const isDM = item.type === 'dm';

  // DM: single avatar + name
  const dmProfile = item.otherProfile;
  const dmPreview = item.lastMessage?.content ?? '';

  // Room: stacked avatars + room name
  const roomName = item.room?.name ?? item.roomMembers?.map((m) => m.profile?.displayName).filter(Boolean).join(', ') ?? '그룹 채팅';
  const roomPreview = item.lastRoomMessage?.content ?? '';
  const memberCount = item.roomMembers?.length ?? 0;

  const preview = isDM ? dmPreview : roomPreview;
  const time = formatRelativeTime(item.lastActivityAt);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar */}
      <TouchableOpacity
        style={styles.avatarArea}
        onPress={() => {
          if (isDM && item.otherUserId && onAvatarPress) {
            onAvatarPress(item.otherUserId);
          }
        }}
        activeOpacity={isDM && onAvatarPress ? 0.7 : 1}
        disabled={!isDM || !onAvatarPress}
      >
        {isDM ? (
          dmProfile?.avatarUrl ? (
            <Image source={{ uri: dmProfile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={24} color={Colors.textMuted} />
            </View>
          )
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="people" size={24} color={Colors.textMuted} />
          </View>
        )}
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>
            {isDM ? (dmProfile?.displayName ?? '알 수 없음') : roomName}
          </Text>
          {!isDM && (
            <Text style={styles.memberCount}> ({memberCount})</Text>
          )}
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {preview || '메시지가 없습니다'}
        </Text>
      </View>

      {/* Unread badge */}
      {item.unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {item.unreadCount > 99 ? '99+' : item.unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarArea: {
    marginRight: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
    flex: 1,
  },
  memberCount: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  time: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginLeft: Spacing.sm,
  },
  preview: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: Spacing.sm,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
