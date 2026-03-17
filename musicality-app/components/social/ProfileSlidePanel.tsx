import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Image,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { useSocialStore } from '../../stores/socialStore';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PANEL_HEIGHT = 390;

export default function ProfileSlidePanel({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { myProfile } = useSocialStore();
  const { user, signOut } = useAuthStore();
  const slideAnim = useRef(new Animated.Value(-PANEL_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(-PANEL_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -PANEL_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const avatarUrl = myProfile?.avatarUrl || user?.user_metadata?.avatar_url;
  const displayName = myProfile?.displayName || user?.user_metadata?.full_name || 'User';

  const handleEditProfile = () => {
    handleClose();
    setTimeout(() => router.push('/profile/edit'), 250);
  };

  const handleCalendar = () => {
    handleClose();
    setTimeout(() => router.push('/calendar'), 250);
  };

  const handleLogout = () => {
    handleClose();
    setTimeout(() => {
      Alert.alert(t('profile.logoutConfirmTitle'), t('profile.logoutConfirmMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: signOut },
      ]);
    }, 250);
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Panel — slides down from top */}
      <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>
        {/* Profile section */}
        <View style={styles.profileSection}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={28} color={Colors.textMuted} />
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
            {myProfile?.nickname && (
              <Text style={styles.nickname}>@{myProfile.nickname}</Text>
            )}
            {user?.email && (
              <Text style={styles.email}>{user.email}</Text>
            )}
          </View>
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
            <Text style={styles.statLabel}>{t('community.followers')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{myProfile?.followingCount ?? 0}</Text>
            <Text style={styles.statLabel}>{t('community.following')}</Text>
          </View>
        </View>

        {/* Menu items */}
        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
            <Ionicons name="create-outline" size={20} color={Colors.primary} />
            <Text style={styles.menuLabel}>{t('profile.editProfile')}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleCalendar}>
            <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
            <Text style={styles.menuLabel}>{t('profile.calendar')}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            <Text style={[styles.menuLabel, { color: Colors.error }]}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  // Profile — horizontal layout
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceLight,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  nickname: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 1,
  },
  email: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  danceStyleBadge: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  danceStyleText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  // Menu
  menu: {},
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.md,
  },
});
