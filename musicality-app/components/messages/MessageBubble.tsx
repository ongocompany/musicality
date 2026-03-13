import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { formatMessageTime } from '../../utils/timeFormat';
import type { Profile } from '../../types/community';

interface Props {
  content: string;
  createdAt: string;
  isOwn: boolean;
  /** Group chat: show sender info (hide if consecutive from same sender) */
  senderProfile?: Profile;
  showSender?: boolean;
}

export default function MessageBubble({ content, createdAt, isOwn, senderProfile, showSender }: Props) {
  const hasAvatar = !isOwn && senderProfile && showSender;

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      {/* Avatar space for other's messages in group chat */}
      {!isOwn && senderProfile !== undefined && (
        <View style={styles.avatarCol}>
          {hasAvatar ? (
            senderProfile.avatarUrl ? (
              <Image source={{ uri: senderProfile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={16} color={Colors.textMuted} />
              </View>
            )
          ) : null}
        </View>
      )}
      <View style={{ maxWidth: '75%' }}>
        {showSender && senderProfile && (
          <Text style={styles.senderName}>{senderProfile.displayName}</Text>
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.content, isOwn ? styles.contentOwn : styles.contentOther]}>
            {content}
          </Text>
        </View>
        <Text style={[styles.time, isOwn && styles.timeOwn]}>
          {formatMessageTime(createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  avatarCol: {
    width: 32,
    marginRight: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderName: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginBottom: 2,
    marginLeft: Spacing.sm,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bubbleOwn: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.surfaceLight,
    borderBottomLeftRadius: 4,
  },
  content: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  contentOwn: {
    color: '#FFFFFF',
  },
  contentOther: {
    color: Colors.text,
  },
  time: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
    marginLeft: Spacing.sm,
  },
  timeOwn: {
    textAlign: 'right',
    marginRight: Spacing.sm,
    marginLeft: 0,
  },
});
