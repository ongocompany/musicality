import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useMessageStore } from '../../stores/messageStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { isSameDay } from '../../utils/timeFormat';
import { parseSlashCommand } from '../../utils/slashCommands';
import MessageBubble from '../../components/messages/MessageBubble';
import MessageInput from '../../components/messages/MessageInput';
import DateSeparator from '../../components/messages/DateSeparator';
import InviteDialog from '../../components/messages/InviteDialog';
import type { DirectMessage } from '../../types/message';

const POLL_INTERVAL = 10_000;

export default function ConversationScreen() {
  const { t } = useTranslation();
  const { userId, name, avatarUrl } = useLocalSearchParams<{ userId: string; name: string; avatarUrl?: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { activeConversation, fetchConversation, sendDM, markDMRead } = useMessageStore();
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const myId = user?.id ?? '';

  // Fetch + poll
  useEffect(() => {
    if (!userId) return;
    fetchConversation(userId);
    markDMRead(userId);

    pollRef.current = setInterval(() => {
      fetchConversation(userId);
      markDMRead(userId);
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [userId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeConversation.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [activeConversation.length]);

  const handleSend = useCallback(async (text: string) => {
    if (!userId) return;

    // Check for /invite command
    const cmd = parseSlashCommand(text);
    if (cmd?.type === 'invite') {
      setShowInvite(true);
      return;
    }

    await sendDM(userId, text);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 200);
  }, [userId, sendDM]);

  const handleInvite = async (inviteeId: string) => {
    if (!userId) return;
    // Create room with current DM partner + invitee
    const roomId = await useMessageStore.getState().createRoom(
      [userId, inviteeId],
    );
    setShowInvite(false);
    router.replace({
      pathname: '/messages/room',
      params: { roomId, name: '그룹 채팅' },
    });
  };

  // Build list items with date separators
  const listItems: Array<{ type: 'date'; dateStr: string } | { type: 'msg'; msg: DirectMessage }> = [];
  for (let i = 0; i < activeConversation.length; i++) {
    const msg = activeConversation[i];
    if (i === 0 || !isSameDay(activeConversation[i - 1].createdAt, msg.createdAt)) {
      listItems.push({ type: 'date', dateStr: msg.createdAt });
    }
    listItems.push({ type: 'msg', msg });
  }

  const renderItem = ({ item }: { item: (typeof listItems)[0] }) => {
    if (item.type === 'date') {
      return <DateSeparator dateStr={item.dateStr} />;
    }
    return (
      <MessageBubble
        content={item.msg.content}
        createdAt={item.msg.createdAt}
        isOwn={item.msg.senderId === myId}
        senderProfile={item.msg.senderId !== myId ? {
          id: userId ?? '',
          displayName: name ?? '',
          avatarUrl: avatarUrl || null,
        } as any : undefined}
        showSender={item.msg.senderId !== myId}
      />
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name || t('messages.conversation')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={listItems}
        keyExtractor={(item, idx) =>
          item.type === 'date' ? `date-${idx}` : `msg-${item.msg.id}`
        }
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Input */}
      <MessageInput onSend={handleSend} />

      {/* Invite Dialog */}
      <InviteDialog
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        onInvite={handleInvite}
        existingMemberIds={userId ? [myId, userId] : [myId]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
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
  headerTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
});
