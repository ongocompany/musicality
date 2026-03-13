/**
 * Message types — DM + Group Chat.
 * Maps to Supabase tables (snake_case → camelCase).
 */
import type { Profile } from './community';

// ─── Direct Message ────────────────────────────────────
export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  readAt: string | null;
  archivedBySender: boolean;
  archivedByRecipient: boolean;
  deletedBySender: boolean;
  deletedByRecipient: boolean;
  createdAt: string;
}

// ─── Conversation Thread (aggregated) ──────────────────
export interface ConversationThread {
  otherUserId: string;
  otherProfile: Profile;
  lastMessage: DirectMessage;
  unreadCount: number;
}

// ─── Group Chat: Room ─────────────────────────────────
export interface ChatRoom {
  id: string;
  name: string | null;
  type: 'dm_converted' | 'group';
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Group Chat: Member ───────────────────────────────
export interface ChatRoomMember {
  id: string;
  roomId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  removedAt: string | null;
  profile?: Profile;
}

// ─── Group Chat: Message ──────────────────────────────
export interface ChatRoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  messageType: 'message' | 'system';
  createdAt: string;
  senderProfile?: Profile;
}

// ─── Unified Inbox Item ───────────────────────────────
export interface InboxItem {
  type: 'dm' | 'room';
  lastActivityAt: string;
  unreadCount: number;
  // DM fields
  otherUserId?: string;
  otherProfile?: Profile;
  lastMessage?: DirectMessage;
  // Room fields
  room?: ChatRoom;
  roomMembers?: ChatRoomMember[];
  lastRoomMessage?: ChatRoomMessage;
}
