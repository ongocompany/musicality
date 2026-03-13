import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { useCommunityStore } from '../../stores/communityStore';
import type { CrewMember } from '../../types/community';

interface Props {
  visible: boolean;
  onClose: () => void;
  onInvite: (userId: string) => Promise<void>;
  /** Already-in-room member user IDs to exclude */
  existingMemberIds: string[];
}

export default function InviteDialog({ visible, onClose, onInvite, existingMemberIds }: Props) {
  const { myCrewIds, crewCache, activeCrewMembers, fetchCrewMembers } = useCommunityStore();
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  const myCrews = myCrewIds.map((id) => crewCache[id]).filter(Boolean);

  // When a crew is selected, fetch its members
  useEffect(() => {
    if (selectedCrewId) {
      setLoading(true);
      fetchCrewMembers(selectedCrewId).finally(() => setLoading(false));
    }
  }, [selectedCrewId]);

  // Filter out existing room members
  const availableMembers = activeCrewMembers.filter(
    (m) => !existingMemberIds.includes(m.userId),
  );

  const handleInvite = async (userId: string) => {
    setInviting(userId);
    try {
      await onInvite(userId);
    } finally {
      setInviting(null);
    }
  };

  const handleClose = () => {
    setSelectedCrewId(null);
    onClose();
  };

  const renderCrewItem = ({ item }: { item: typeof myCrews[0] }) => (
    <TouchableOpacity
      style={styles.crewItem}
      onPress={() => setSelectedCrewId(item.id)}
      activeOpacity={0.7}
    >
      <Ionicons name="people" size={20} color={Colors.primary} />
      <Text style={styles.crewName} numberOfLines={1}>{item.name}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  const renderMemberItem = ({ item }: { item: CrewMember }) => (
    <View style={styles.memberRow}>
      {item.profile?.avatarUrl ? (
        <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={18} color={Colors.textMuted} />
        </View>
      )}
      <Text style={styles.memberName} numberOfLines={1}>
        {item.profile?.displayName ?? '알 수 없음'}
      </Text>
      <TouchableOpacity
        style={styles.inviteBtn}
        onPress={() => handleInvite(item.userId)}
        disabled={inviting === item.userId}
      >
        {inviting === item.userId ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={styles.inviteBtnText}>초대</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            {selectedCrewId ? (
              <TouchableOpacity onPress={() => setSelectedCrewId(null)}>
                <Ionicons name="chevron-back" size={24} color={Colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 24 }} />
            )}
            <Text style={styles.title}>
              {selectedCrewId ? '멤버 선택' : '크루 선택'}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {!selectedCrewId ? (
            myCrews.length > 0 ? (
              <FlatList
                data={myCrews}
                keyExtractor={(item) => item.id}
                renderItem={renderCrewItem}
                style={styles.list}
              />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>가입한 크루가 없습니다</Text>
              </View>
            )
          ) : loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : availableMembers.length > 0 ? (
            <FlatList
              data={availableMembers}
              keyExtractor={(item) => item.id}
              renderItem={renderMemberItem}
              style={styles.list}
            />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>초대할 수 있는 멤버가 없습니다</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 34, // safe area
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  list: {
    paddingVertical: Spacing.sm,
  },
  crewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  crewName: {
    color: Colors.text,
    fontSize: FontSize.md,
    flex: 1,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    marginRight: Spacing.sm,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  inviteBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minWidth: 50,
    alignItems: 'center',
  },
  inviteBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  empty: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
});
