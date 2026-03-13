import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { useSocialStore } from '../../stores/socialStore';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileSlidePanel({ visible, onClose }: Props) {
  const router = useRouter();
  const { myProfile } = useSocialStore();
  const { user, signOut } = useAuthStore();

  const avatarUrl = myProfile?.avatarUrl || user?.user_metadata?.avatar_url;
  const displayName = myProfile?.displayName || user?.user_metadata?.full_name || '사용자';

  const handleEditProfile = () => {
    onClose();
    router.push('/profile/edit');
  };

  const handleLogout = () => {
    onClose();
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.panel} activeOpacity={1} onPress={() => {}}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Profile section */}
          <View style={styles.profileSection}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={36} color={Colors.textMuted} />
              </View>
            )}
            <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
            {myProfile?.nickname && (
              <Text style={styles.nickname}>@{myProfile.nickname}</Text>
            )}
            {myProfile?.danceStyle && (
              <View style={styles.danceStyleBadge}>
                <Text style={styles.danceStyleText}>
                  {myProfile.danceStyle.charAt(0).toUpperCase() + myProfile.danceStyle.slice(1)}
                </Text>
              </View>
            )}
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{myProfile?.followerCount ?? 0}</Text>
              <Text style={styles.statLabel}>팔로워</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{myProfile?.followingCount ?? 0}</Text>
              <Text style={styles.statLabel}>팔로잉</Text>
            </View>
          </View>

          {/* Menu items */}
          <View style={styles.menu}>
            <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
              <Ionicons name="create-outline" size={22} color={Colors.primary} />
              <Text style={styles.menuLabel}>프로필 편집</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color={Colors.error} />
              <Text style={[styles.menuLabel, { color: Colors.error }]}>로그아웃</Text>
            </TouchableOpacity>
          </View>

          {/* Email */}
          {user?.email && (
            <Text style={styles.email}>{user.email}</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  // Profile
  profileSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceLight,
    marginBottom: Spacing.md,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  displayName: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  nickname: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginTop: 2,
  },
  danceStyleBadge: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  danceStyleText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  // Menu
  menu: {
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.lg,
  },
  email: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
