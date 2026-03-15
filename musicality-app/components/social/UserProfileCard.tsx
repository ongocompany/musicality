import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import type { Profile, UserSocialContext } from '../../types/community';

const DANCE_STYLES: Record<string, string> = {
  bachata: 'Bachata',
  salsa: 'Salsa',
  kizomba: 'Kizomba',
  zouk: 'Zouk',
  other: 'Other',
};

interface Props {
  profile: Profile;
  socialContext?: UserSocialContext | null;
  isOwnProfile?: boolean;
  onFollowToggle?: () => void;
  onDM?: () => void;
  onNote?: () => void;
  onBlock?: () => void;
  onFollowersTap?: () => void;
  onFollowingTap?: () => void;
  followLoading?: boolean;
}

export default function UserProfileCard({
  profile,
  socialContext,
  isOwnProfile,
  onFollowToggle,
  onDM,
  onNote,
  onBlock,
  onFollowersTap,
  onFollowingTap,
  followLoading,
}: Props) {
  const { t } = useTranslation();
  const followerCount = socialContext?.followerCount ?? profile.followerCount;
  const followingCount = socialContext?.followingCount ?? profile.followingCount;

  return (
    <View style={styles.container}>
      {/* Avatar + Name */}
      <View style={styles.header}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={36} color={Colors.textMuted} />
          </View>
        )}
        <View style={styles.nameSection}>
          <Text style={styles.displayName} numberOfLines={1}>{profile.displayName}</Text>
          {profile.nickname && (
            <Text style={styles.nickname}>@{profile.nickname}</Text>
          )}
          {profile.danceStyle && profile.danceStyle !== 'bachata' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {DANCE_STYLES[profile.danceStyle] ?? profile.danceStyle}
              </Text>
            </View>
          )}
          {profile.danceStyle === 'bachata' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Bachata</Text>
            </View>
          )}
        </View>
      </View>

      {/* Follower / Following counts */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statItem} onPress={onFollowersTap}>
          <Text style={styles.statNumber}>{followerCount}</Text>
          <Text style={styles.statLabel}>{t('community.followers')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statItem} onPress={onFollowingTap}>
          <Text style={styles.statNumber}>{followingCount}</Text>
          <Text style={styles.statLabel}>{t('community.following')}</Text>
        </TouchableOpacity>
      </View>

      {/* Action buttons (only for other users) */}
      {!isOwnProfile && socialContext && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, socialContext.isFollowing && styles.actionBtnActive]}
            onPress={onFollowToggle}
            disabled={followLoading}
          >
            <Ionicons
              name={socialContext.isFollowing ? 'person-remove' : 'person-add'}
              size={16}
              color={socialContext.isFollowing ? Colors.primary : Colors.text}
            />
            <Text style={[styles.actionText, socialContext.isFollowing && styles.actionTextActive]}>
              {socialContext.isFollowing ? '언팔로우' : '팔로우'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={onDM}>
            <Ionicons name="chatbubble-outline" size={16} color={Colors.text} />
            <Text style={styles.actionText}>DM</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={onNote}>
            <Ionicons
              name={socialContext.note ? 'document-text' : 'document-text-outline'}
              size={16}
              color={socialContext.note ? Colors.accent : Colors.text}
            />
            <Text style={styles.actionText}>메모</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, socialContext.isBlocked && styles.actionBtnDanger]}
            onPress={onBlock}
          >
            <Ionicons
              name={socialContext.isBlocked ? 'ban' : 'ban-outline'}
              size={16}
              color={socialContext.isBlocked ? Colors.error : Colors.text}
            />
            <Text style={[styles.actionText, socialContext.isBlocked && styles.actionTextDanger]}>
              {socialContext.isBlocked ? '차단해제' : '차단'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.lg,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceLight,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameSection: {
    flex: 1,
    marginLeft: Spacing.md,
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginTop: Spacing.xs,
  },
  badgeText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  actionBtnActive: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  actionBtnDanger: {
    borderWidth: 1,
    borderColor: Colors.error,
  },
  actionText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  actionTextActive: {
    color: Colors.primary,
  },
  actionTextDanger: {
    color: Colors.error,
  },
});
