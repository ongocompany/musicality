import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { useMessageStore } from '../../stores/messageStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { isSameDay } from '../../utils/timeFormat';
import { parseSlashCommand } from '../../utils/slashCommands';
import MessageBubble from '../../components/messages/MessageBubble';
import MessageInput from '../../components/messages/MessageInput';
import DateSeparator from '../../components/messages/DateSeparator';
import SystemMessage from '../../components/messages/SystemMessage';
import RoomHeader from '../../components/messages/RoomHeader';
import MembersPanel from '../../components/messages/MembersPanel';
import InviteDialog from '../../components/messages/InviteDialog';
import type { ChatRoomMessage } from '../../types/message';

const POLL_INTERVAL = 10_000;

type ListItem =
  | { type: 'date'; dateStr: string }
  | { type: 'system'; content: string; id: string }
  | { type: 'msg'; msg: ChatRoomMessage; showSender: boolean };

export default function RoomScreen() {
  const { roomId, name: paramName } = useLocalSearchParams<{ roomId: string; name: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    activeRoom,
    activeRoomMessages,
    activeRoomMembers,
    fetchRoom,
    sendRoomMsg,
    markRoomRead,
    inviteMember,
    kickMember,
    leaveRoom,
    closeRoom,
  } = useMessageStore();

  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const myId = user?.id ?? '';
  const isActive = activeRoom?.isActive !== false;
  const isOwner = activeRoom?.createdBy === myId;

  const roomName = activeRoom?.name
    ?? activeRoomMembers
        .filter((m) => m.userId !== myId)
        .map((m) => m.profile?.displayName)
        .filter(Boolean)
        .join(', ')
    ?? paramName
    ?? '그룹 채팅';

  // Fetch + poll
  useEffect(() => {
    if (!roomId) return;
    fetchRoom(roomId);
    markRoomRead(roomId);

    pollRef.current = setInterval(() => {
      fetchRoom(roomId);
      markRoomRead(roomId);
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [roomId]);

  // Scroll to bottom
  useEffect(() => {
    if (activeRoomMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [activeRoomMessages.length]);

  const handleSend = useCallback(async (text: string) => {
    if (!roomId) return;

    const cmd = parseSlashCommand(text);
    if (cmd) {
      switch (cmd.type) {
        case 'invite':
          setShowInvite(true);
          return;
        case 'kick': {
          const target = activeRoomMembers.find(
            (m) => m.profile?.displayName?.toLowerCase() === cmd.targetName.toLowerCase(),
          );
          if (target) {
            Alert.alert(
              '강퇴',
              `${target.profile?.displayName}님을 강퇴하시겠습니까?`,
              [
                { text: '취소', style: 'cancel' },
                {
                  text: '강퇴',
                  style: 'destructive',
                  onPress: () => kickMember(roomId, target.userId),
                },
              ],
            );
          } else {
            Alert.alert('오류', `"${cmd.targetName}" 멤버를 찾을 수 없습니다`);
          }
          return;
        }
        case 'close':
          Alert.alert(
            '채팅방 종료',
            '채팅방을 종료하시겠습니까?',
            [
              { text: '취소', style: 'cancel' },
              {
                text: '종료',
                style: 'destructive',
                onPress: () => closeRoom(roomId),
              },
            ],
          );
          return;
      }
    }

    await sendRoomMsg(roomId, text);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 200);
  }, [roomId, activeRoomMembers, sendRoomMsg, kickMember, closeRoom]);

  const handleInvite = async (userId: string) => {
    if (!roomId) return;
    await inviteMember(roomId, userId);
  };

  const handleKick = (userId: string) => {
    if (!roomId) return;
    const member = activeRoomMembers.find((m) => m.userId === userId);
    Alert.alert(
      '강퇴',
      `${member?.profile?.displayName ?? '멤버'}님을 강퇴하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '강퇴',
          style: 'destructive',
          onPress: () => kickMember(roomId, userId),
        },
      ],
    );
  };

  // Build list items
  const listItems: ListItem[] = [];
  for (let i = 0; i < activeRoomMessages.length; i++) {
    const msg = activeRoomMessages[i];
    if (i === 0 || !isSameDay(activeRoomMessages[i - 1].createdAt, msg.createdAt)) {
      listItems.push({ type: 'date', dateStr: msg.createdAt });
    }
    if (msg.messageType === 'system') {
      listItems.push({ type: 'system', content: msg.content, id: msg.id });
    } else {
      // Hide sender if same as previous non-system message
      const prevMsg = i > 0 ? activeRoomMessages[i - 1] : null;
      const showSender = !prevMsg || prevMsg.messageType === 'system' || prevMsg.senderId !== msg.senderId;
      listItems.push({ type: 'msg', msg, showSender });
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case 'date':
        return <DateSeparator dateStr={item.dateStr} />;
      case 'system':
        return <SystemMessage content={item.content} />;
      case 'msg':
        return (
          <MessageBubble
            content={item.msg.content}
            createdAt={item.msg.createdAt}
            isOwn={item.msg.senderId === myId}
            senderProfile={item.msg.senderProfile}
            showSender={item.showSender}
          />
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <RoomHeader
        roomName={roomName}
        members={activeRoomMembers}
        onToggleMembers={() => setShowMembers((v) => !v)}
      />

      {/* Members Panel */}
      {showMembers && (
        <MembersPanel
          members={activeRoomMembers}
          currentUserId={myId}
          isOwner={isOwner}
          onInvite={() => setShowInvite(true)}
          onKick={isOwner ? handleKick : undefined}
        />
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={listItems}
        keyExtractor={(item, idx) => {
          if (item.type === 'date') return `date-${idx}`;
          if (item.type === 'system') return `sys-${item.id}`;
          return `msg-${item.msg.id}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Input or closed notice */}
      {isActive ? (
        <MessageInput onSend={handleSend} />
      ) : (
        <View style={styles.closedBar}>
          <Text style={styles.closedText}>채팅방이 종료되었습니다</Text>
        </View>
      )}

      {/* Invite Dialog */}
      <InviteDialog
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        onInvite={handleInvite}
        existingMemberIds={activeRoomMembers.map((m) => m.userId)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
  closedBar: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  closedText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
});
