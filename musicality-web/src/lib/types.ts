/**
 * Community types — shared with mobile app.
 * All types map to Supabase tables (snake_case → camelCase).
 */

// ─── Profile ────────────────────────────────────────────
export interface Profile {
  id: string;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  danceStyle: string;
  lastActiveAt: string | null;
  nicknameChangedAt: string | null;
  followerCount: number;
  followingCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Crew ───────────────────────────────────────────────
export type CrewType = 'open' | 'closed';

export interface Crew {
  id: string;
  name: string;
  description: string;
  thumbnailUrl: string | null;
  crewType: CrewType;
  captainId: string;
  memberLimit: number;
  memberCount: number;
  danceStyle: string;
  region: string; // 'global' | ISO country code (e.g. 'KR', 'US', 'JP')
  inviteCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCrewInput {
  name: string;
  description?: string;
  crewType: CrewType;
  memberLimit?: number;
  danceStyle?: string;
  region?: string;
}

// ─── Crew Member ────────────────────────────────────────
export type MemberRole = 'captain' | 'moderator' | 'regular' | 'member' | 'seedling';

/** Role level for permission checks (higher = more authority) */
export const ROLE_LEVELS: Record<MemberRole, number> = {
  seedling: 0,
  member: 1,
  regular: 2,
  moderator: 3,
  captain: 4,
} as const;

/** Badge config per role */
export const ROLE_CONFIG: Record<MemberRole, { label: string; color: string; emoji: string }> = {
  seedling:   { label: 'Seedling',   color: 'bg-green-500/20 text-green-400 border-green-500/30',     emoji: '🌱' },
  member:     { label: 'Member',     color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',        emoji: '🔵' },
  regular:    { label: 'Regular',    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',   emoji: '🟣' },
  moderator:  { label: 'Moderator',  color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',   emoji: '🛡️' },
  captain:    { label: 'Captain',    color: 'bg-red-500/20 text-red-400 border-red-500/30',            emoji: '👑' },
} as const;

export interface CrewMember {
  id: string;
  crewId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
  profile?: Profile;
}

// ─── Join Request ───────────────────────────────────────
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface JoinRequest {
  id: string;
  crewId: string;
  userId: string;
  status: RequestStatus;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  profile?: Profile;
}

// ─── Song Thread ────────────────────────────────────────
export interface SongThread {
  id: string;
  crewId: string;
  title: string;
  normalizedTitle: string;
  youtubeId: string | null;
  bpm: number | null;
  danceStyle: string;
  postCount: number;
  lastActivityAt: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateThreadInput {
  title: string;
  youtubeId?: string;
  bpm?: number;
  danceStyle?: string;
}

// ─── Thread PhraseNote ──────────────────────────────────
export interface ThreadPhraseNote {
  id: string;
  threadId: string;
  userId: string;
  phraseNoteData: Record<string, unknown>;
  description: string;
  createdAt: string;
  profile?: Profile;
}

// ─── General Post ───────────────────────────────────────
export interface GeneralPost {
  id: string;
  crewId: string;
  userId: string;
  content: string;
  parentId: string | null;
  mediaUrls: string[];
  likeCount: number;
  replyCount: number;
  viewCount: number;
  liked?: boolean; // client-side: did current user like this?
  createdAt: string;
  updatedAt: string;
  profile?: Profile;
  replies?: GeneralPost[];
}

// ─── Media Upload ──────────────────────────────────────
export const MEDIA_LIMITS = {
  IMAGE_MAX_SIZE: 5 * 1024 * 1024,   // 5MB
  VIDEO_MAX_SIZE: 50 * 1024 * 1024,  // 50MB
  MAX_FILES: 4,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/quicktime', 'video/webm'],
} as const;

// ─── Social: Follow ────────────────────────────────────
export interface UserFollow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
  profile?: Profile;
}

// ─── Social: Block ─────────────────────────────────────
export interface UserBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
  profile?: Profile;
}

// ─── Social: Private Note ──────────────────────────────
export interface UserNote {
  id: string;
  authorId: string;
  targetUserId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Social: Direct Message ────────────────────────────
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

// ─── User Social Context (for popover) ─────────────────
export interface UserSocialContext {
  isFollowing: boolean;
  isBlocked: boolean;
  note: UserNote | null;
  followerCount: number;
  followingCount: number;
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
