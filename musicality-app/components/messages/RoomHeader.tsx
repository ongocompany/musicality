import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import type { ChatRoomMember } from '../../types/message';

interface Props {
  roomName: string;
  members: ChatRoomMember[];
  onToggleMembers: () => void;
}

export default function RoomHeader({ roomName, members, onToggleMembers }: Props) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={Colors.text} />
      </TouchableOpacity>

      <View style={styles.titleArea}>
        <Text style={styles.title} numberOfLines={1}>{roomName}</Text>
        <Text style={styles.memberCount}>{members.length}명</Text>
      </View>

      <TouchableOpacity onPress={onToggleMembers} style={styles.menuBtn}>
        <Ionicons name="people-outline" size={22} color={Colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    marginRight: Spacing.sm,
  },
  titleArea: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  memberCount: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  menuBtn: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
  },
});
