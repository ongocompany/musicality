import React from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { GHOST_AVATAR, getDeletedUserName } from '../../utils/deletedUser';
import type { ChatRoomMember } from '../../types/message';

interface Props {
  members: ChatRoomMember[];
  currentUserId: string;
  isOwner: boolean;
  onInvite: () => void;
  onKick?: (userId: string) => void;
}

export default function MembersPanel({ members, currentUserId, isOwner, onInvite, onKick }: Props) {
  const renderMember = ({ item }: { item: ChatRoomMember }) => {
    const isMe = item.userId === currentUserId;
    const isItemOwner = item.role === 'owner';

    return (
      <View style={styles.memberRow}>
        {!item.profile ? (
          <Image source={GHOST_AVATAR} style={styles.avatar} />
        ) : item.profile.avatarUrl ? (
          <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={18} color={Colors.textMuted} />
          </View>
        )}
        <Text style={[styles.memberName, !item.profile && { color: Colors.textMuted, fontStyle: 'italic' as const }]} numberOfLines={1}>
          {item.profile?.displayName ?? getDeletedUserName()}
          {isMe && ' (나)'}
        </Text>
        {isItemOwner && (
          <Text style={styles.ownerBadge}>👑</Text>
        )}
        {isOwner && !isMe && !isItemOwner && onKick && (
          <TouchableOpacity onPress={() => onKick(item.userId)} style={styles.kickBtn}>
            <Ionicons name="close-circle-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>멤버 ({members.length})</Text>
        <TouchableOpacity onPress={onInvite} style={styles.inviteBtn}>
          <Ionicons name="person-add-outline" size={18} color={Colors.primary} />
          <Text style={styles.inviteText}>초대</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inviteText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    marginRight: Spacing.sm,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  memberName: {
    color: Colors.text,
    fontSize: FontSize.md,
    flex: 1,
  },
  ownerBadge: {
    fontSize: 14,
    marginLeft: Spacing.xs,
  },
  kickBtn: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
  },
});
