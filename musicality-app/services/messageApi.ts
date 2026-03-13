/**
 * Message API — Direct Supabase queries for DM + Group Chat.
 * Ported from web app's lib/api.ts (lines 858-1366).
 */
import { supabase } from '../lib/supabase';
import { mapProfile } from './communityApi';
import type { Profile } from '../types/community';
import type {
  DirectMessage,
  ConversationThread,
  ChatRoom,
  ChatRoomMember,
  ChatRoomMessage,
  InboxItem,
} from '../types/message';

// ─── Mappers ─────────────────────────────────────────────

function mapDirectMessage(row: any): DirectMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    content: row.content,
    readAt: row.read_at ?? null,
    archivedBySender: row.archived_by_sender ?? false,
    archivedByRecipient: row.archived_by_recipient ?? false,
    deletedBySender: row.deleted_by_sender ?? false,
    deletedByRecipient: row.deleted_by_recipient ?? false,
    createdAt: row.created_at,
  };
}

function mapChatRoom(row: any): ChatRoom {
  return {
    id: row.id,
    name: row.name ?? null,
    type: row.type,
    createdBy: row.created_by,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChatRoomMember(row: any): ChatRoomMember {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    removedAt: row.removed_at ?? null,
  };
}

function mapChatRoomMessage(row: any): ChatRoomMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    content: row.content,
    messageType: row.message_type,
    createdAt: row.created_at,
  };
}

// ─── Helpers ─────────────────────────────────────────────

async function fetchProfilesByIds(userIds: string[]): Promise<Map<string, Profile>> {
  const map = new Map<string, Profile>();
  if (userIds.length === 0) return map;

  const unique = [...new Set(userIds)];
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .in('id', unique);

  if (data) {
    for (const row of data) {
      map.set(row.id, mapProfile(row));
    }
  }
  return map;
}

async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// ─── DM: Send ───────────────────────────────────────────

export async function sendMessage(recipientId: string, content: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_message', {
    p_recipient_id: recipientId,
    p_content: content.trim(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// ─── DM: Fetch Conversations (inbox) ────────────────────

export async function fetchConversations(): Promise<ConversationThread[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Group by conversation partner
  const conversationMap = new Map<string, { messages: any[]; unread: number }>();

  for (const row of rows) {
    const isSender = row.sender_id === userId;
    if (isSender && row.deleted_by_sender) continue;
    if (!isSender && row.deleted_by_recipient) continue;

    const otherId = isSender ? row.recipient_id : row.sender_id;

    if (!conversationMap.has(otherId)) {
      conversationMap.set(otherId, { messages: [], unread: 0 });
    }
    const conv = conversationMap.get(otherId)!;
    conv.messages.push(row);
    if (!isSender && !row.read_at) conv.unread++;
  }

  const otherIds = Array.from(conversationMap.keys());
  if (otherIds.length === 0) return [];

  const profileMap = await fetchProfilesByIds(otherIds);

  const threads: ConversationThread[] = [];
  for (const [otherId, conv] of conversationMap) {
    const profile = profileMap.get(otherId);
    if (!profile) continue;

    threads.push({
      otherUserId: otherId,
      otherProfile: profile,
      lastMessage: mapDirectMessage(conv.messages[0]),
      unreadCount: conv.unread,
    });
  }

  return threads.sort(
    (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime(),
  );
}

// ─── DM: Fetch Single Conversation ──────────────────────

export async function fetchConversation(otherUserId: string): Promise<DirectMessage[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`,
    )
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row: any) => {
      const isSender = row.sender_id === userId;
      if (isSender && row.deleted_by_sender) return false;
      if (!isSender && row.deleted_by_recipient) return false;
      return true;
    })
    .map(mapDirectMessage);
}

// ─── DM: Mark Read ──────────────────────────────────────

export async function markMessagesRead(senderId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_messages_read', { p_sender_id: senderId });
  if (error) throw new Error(error.message);
}

// ─── DM: Delete ─────────────────────────────────────────

export async function deleteMessage(messageId: string): Promise<void> {
  const userId = await getCurrentUserId();

  const { data: msg } = await supabase
    .from('direct_messages')
    .select('sender_id, recipient_id')
    .eq('id', messageId)
    .single();

  if (!msg) throw new Error('Message not found');

  const update: Record<string, boolean> = {};
  if (msg.sender_id === userId) update.deleted_by_sender = true;
  if (msg.recipient_id === userId) update.deleted_by_recipient = true;

  if (Object.keys(update).length === 0) throw new Error('Not authorized');

  const { error } = await supabase
    .from('direct_messages')
    .update(update)
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

// ─── Room: Create ───────────────────────────────────────

export async function createChatRoom(
  memberIds: string[],
  name?: string,
  type: 'dm_converted' | 'group' = 'group',
): Promise<string> {
  const { data, error } = await supabase.rpc('create_chat_room', {
    p_member_ids: memberIds,
    p_name: name ?? null,
    p_type: type,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// ─── Room: Send Message ─────────────────────────────────

export async function sendRoomMessage(roomId: string, content: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_room_message', {
    p_room_id: roomId,
    p_content: content.trim(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// ─── Room: Member Operations ────────────────────────────

export async function inviteToRoom(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('invite_to_room', {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function kickFromRoom(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('kick_from_room', {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function leaveRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function closeRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('close_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

// ─── Room: Mark Read ────────────────────────────────────

export async function markRoomMessagesRead(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_room_messages_read', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

// ─── Room: Fetch Messages ───────────────────────────────

export async function fetchRoomMessages(roomId: string): Promise<ChatRoomMessage[]> {
  const { data, error } = await supabase
    .from('chat_room_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const senderIds = [...new Set(
    rows.filter((r: any) => r.message_type === 'message').map((r: any) => r.sender_id),
  )];
  const profileMap = await fetchProfilesByIds(senderIds);

  return rows.map((row: any) => ({
    ...mapChatRoomMessage(row),
    senderProfile: profileMap.get(row.sender_id),
  }));
}

// ─── Room: Fetch Members ────────────────────────────────

export async function fetchRoomMembers(roomId: string): Promise<ChatRoomMember[]> {
  const { data, error } = await supabase
    .from('chat_room_members')
    .select('*')
    .eq('room_id', roomId)
    .is('removed_at', null)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(rows.map((r: any) => r.user_id));
  return rows.map((row: any) => ({ ...mapChatRoomMember(row), profile: profileMap.get(row.user_id) }));
}

// ─── Room: Fetch My Rooms ───────────────────────────────

export async function fetchMyRooms(): Promise<ChatRoom[]> {
  const userId = await getCurrentUserId();

  const { data: memberRows, error: memberErr } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', userId)
    .is('removed_at', null);

  if (memberErr) throw new Error(memberErr.message);
  const roomIds = (memberRows ?? []).map((r: any) => r.room_id);
  if (roomIds.length === 0) return [];

  const { data, error } = await supabase
    .from('chat_rooms')
    .select('*')
    .in('id', roomIds)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapChatRoom);
}

// ─── Unified Inbox ──────────────────────────────────────

export async function fetchUnifiedInbox(): Promise<InboxItem[]> {
  const userId = await getCurrentUserId();

  const [dmThreads, rooms] = await Promise.all([
    fetchConversations(),
    fetchMyRooms(),
  ]);

  const items: InboxItem[] = [];

  // Add DM items
  for (const thread of dmThreads) {
    items.push({
      type: 'dm',
      lastActivityAt: thread.lastMessage.createdAt,
      unreadCount: thread.unreadCount,
      otherUserId: thread.otherUserId,
      otherProfile: thread.otherProfile,
      lastMessage: thread.lastMessage,
    });
  }

  // Add room items
  if (rooms.length > 0) {
    const roomIds = rooms.map((r) => r.id);

    // Batch fetch last messages
    const { data: lastMsgRows } = await supabase
      .from('chat_room_messages')
      .select('*')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false });

    const lastMsgByRoom = new Map<string, any>();
    for (const row of lastMsgRows ?? []) {
      if (!lastMsgByRoom.has(row.room_id)) {
        lastMsgByRoom.set(row.room_id, row);
      }
    }

    // Batch fetch members
    const { data: memberRows } = await supabase
      .from('chat_room_members')
      .select('*')
      .in('room_id', roomIds)
      .is('removed_at', null);

    const membersByRoom = new Map<string, any[]>();
    for (const row of memberRows ?? []) {
      if (!membersByRoom.has(row.room_id)) {
        membersByRoom.set(row.room_id, []);
      }
      membersByRoom.get(row.room_id)!.push(row);
    }

    // Fetch profiles for all members
    const allMemberIds = [...new Set((memberRows ?? []).map((r: any) => r.user_id))];
    const profileMap = await fetchProfilesByIds(allMemberIds);

    // Batch fetch read cursors
    const { data: readRows } = await supabase
      .from('chat_room_reads')
      .select('*')
      .eq('user_id', userId)
      .in('room_id', roomIds);

    const readByRoom = new Map<string, string>();
    for (const row of readRows ?? []) {
      readByRoom.set(row.room_id, row.last_read_at);
    }

    // Count unread per room
    for (const room of rooms) {
      const lastReadAt = readByRoom.get(room.id);
      let unreadCount = 0;

      if (lastReadAt) {
        const { count } = await supabase
          .from('chat_room_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .gt('created_at', lastReadAt);
        unreadCount = count ?? 0;
      } else {
        const { count } = await supabase
          .from('chat_room_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .eq('message_type', 'message');
        unreadCount = count ?? 0;
      }

      const lastMsgRow = lastMsgByRoom.get(room.id);
      const members = (membersByRoom.get(room.id) ?? []).map((row: any) => ({
        ...mapChatRoomMember(row),
        profile: profileMap.get(row.user_id),
      }));

      items.push({
        type: 'room',
        lastActivityAt: lastMsgRow?.created_at ?? room.updatedAt,
        unreadCount,
        room,
        roomMembers: members,
        lastRoomMessage: lastMsgRow ? mapChatRoomMessage(lastMsgRow) : undefined,
      });
    }
  }

  // Sort by most recent activity
  items.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  return items;
}

// ─── Combined Unread Count ──────────────────────────────

export async function fetchTotalUnreadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  // DM unread
  const { count: dmCount } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null)
    .eq('deleted_by_recipient', false);

  // Room unread
  let roomUnread = 0;

  const { data: memberRows } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', user.id)
    .is('removed_at', null);

  const roomIds = (memberRows ?? []).map((r: any) => r.room_id);

  if (roomIds.length > 0) {
    const { data: activeRooms } = await supabase
      .from('chat_rooms')
      .select('id')
      .in('id', roomIds)
      .eq('is_active', true);

    const activeRoomIds = (activeRooms ?? []).map((r: any) => r.id);

    if (activeRoomIds.length > 0) {
      const { data: readRows } = await supabase
        .from('chat_room_reads')
        .select('room_id, last_read_at')
        .eq('user_id', user.id)
        .in('room_id', activeRoomIds);

      const readByRoom = new Map<string, string>();
      for (const row of readRows ?? []) {
        readByRoom.set(row.room_id, row.last_read_at);
      }

      for (const roomId of activeRoomIds) {
        const lastReadAt = readByRoom.get(roomId);
        if (lastReadAt) {
          const { count } = await supabase
            .from('chat_room_messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', roomId)
            .gt('created_at', lastReadAt);
          roomUnread += count ?? 0;
        } else {
          const { count } = await supabase
            .from('chat_room_messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', roomId)
            .eq('message_type', 'message');
          roomUnread += count ?? 0;
        }
      }
    }
  }

  return (dmCount ?? 0) + roomUnread;
}
