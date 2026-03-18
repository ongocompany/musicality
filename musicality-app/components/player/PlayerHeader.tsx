import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { MarqueeTitle } from './MarqueeTitle';

interface PlayerHeaderProps {
  title: string;
  mediaType: 'audio' | 'video' | 'youtube';
  bpm?: number;
  isEdit?: boolean;
  slotId?: string;
  onSettingsPress?: () => void;
}

export function PlayerHeader({
  title, mediaType, bpm,
  isEdit = false, slotId,
  onSettingsPress,
}: PlayerHeaderProps) {
  const icon = mediaType === 'youtube' ? 'logo-youtube'
    : mediaType === 'video' ? 'videocam' : 'musical-notes';
  const iconColor = mediaType === 'youtube' ? '#FF0000' : Colors.primary;

  return (
    <View style={styles.header}>
      <Ionicons name={icon} size={18} color={iconColor} style={{ marginRight: Spacing.xs }} />
      <MarqueeTitle text={title} style={styles.title} />

      <View style={styles.meta}>
        {isEdit && slotId && (
          <View style={styles.slot}>
            <Text style={styles.slotText}>S</Text>
            <View style={styles.autoDot} />
          </View>
        )}

        {bpm != null && (
          <View style={styles.bpmBadge}>
            <Text style={styles.bpmText}>{Math.round(bpm)} BPM</Text>
          </View>
        )}

        {isEdit && onSettingsPress && (
          <TouchableOpacity style={styles.settingsBtn} onPress={onSettingsPress}>
            <Ionicons name="settings-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(187,134,252,0.5)',
    backgroundColor: 'rgba(187,134,252,0.08)',
  },
  slotText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
  autoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.success,
  },
  bpmBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(187,134,252,0.2)',
  },
  bpmText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  settingsBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
