import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import type { Crew } from '../../types/community';

/** Convert ISO country code to flag emoji, 'global' → 🌐 */
function regionToFlag(region?: string): string {
  if (!region || region === 'global') return '🌐';
  return region
    .toUpperCase()
    .split('')
    .map((ch) => String.fromCodePoint(ch.charCodeAt(0) + 127397))
    .join('');
}

interface CrewCardProps {
  crew: Crew;
  isMember?: boolean;
  isCaptain?: boolean;
  onPress: () => void;
}

export default function CrewCard({ crew, isMember, isCaptain, onPress }: CrewCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Thumbnail */}
      <View style={styles.thumbnail}>
        {crew.thumbnailUrl ? (
          <Image source={{ uri: crew.thumbnailUrl }} style={styles.thumbnailImage} />
        ) : (
          <Ionicons name="people" size={28} color={Colors.textMuted} />
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{crew.name}</Text>
          {isCaptain ? (
            <View style={styles.captainBadge}>
              <Text style={styles.captainBadgeText}>Captain</Text>
            </View>
          ) : isMember ? (
            <View style={styles.memberBadge}>
              <Text style={styles.memberBadgeText}>Joined</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          {/* Type badge */}
          <View style={[styles.typeBadge, crew.crewType === 'closed' && styles.closedBadge]}>
            <Ionicons
              name={crew.crewType === 'open' ? 'globe-outline' : 'lock-closed-outline'}
              size={10}
              color={crew.crewType === 'open' ? Colors.accent : Colors.warning}
            />
            <Text style={[styles.typeBadgeText, crew.crewType === 'closed' && styles.closedBadgeText]}>
              {crew.crewType === 'open' ? 'Open' : 'Closed'}
            </Text>
          </View>

          {/* Members count */}
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>
              {crew.memberCount}/{crew.memberLimit}
            </Text>
          </View>

          {/* Dance style */}
          <View style={styles.metaItem}>
            <Ionicons name="musical-note-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>{crew.danceStyle}</Text>
          </View>

          {/* Region flag */}
          <Text style={styles.regionFlag}>{regionToFlag(crew.region)}</Text>
        </View>

        {crew.description ? (
          <Text style={styles.description} numberOfLines={1}>{crew.description}</Text>
        ) : null}
      </View>

      {/* Arrow */}
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    flexShrink: 1,
  },
  captainBadge: {
    backgroundColor: Colors.warning + '25',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  captainBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.warning,
  },
  memberBadge: {
    backgroundColor: Colors.primary + '30',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  memberBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  closedBadge: {
    backgroundColor: Colors.warning + '20',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.accent,
  },
  closedBadgeText: {
    color: Colors.warning,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  regionFlag: {
    fontSize: 13,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
