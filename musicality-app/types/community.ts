/**
 * Community types — Crew system for PhraseNote sharing.
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
  followerCount: number;
  followingCount: number;
  lastActiveAt: string | null;
  nicknameChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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

// ─── Social Context ────────────────────────────────────
export interface UserSocialContext {
  isFollowing: boolean;
  isBlocked: boolean;
  note: UserNote | null;
  followerCount: number;
  followingCount: number;
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
  region: string;       // 'global' | ISO country code (e.g. 'KR', 'US', 'JP')
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
export type MemberRole = 'captain' | 'moderator' | 'member';

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
  fingerprint: string | null;
  postCount: number;
  lastActivityAt: string;
  createdBy: string;
  createdAt: string;
  latestNoteFormat?: 'pnote' | 'cnote' | null;
}

export interface CreateThreadInput {
  title: string;
  youtubeId?: string;
  bpm?: number;
  danceStyle?: string;
  fingerprint?: string;
}

// ─── Thread PhraseNote ──────────────────────────────────
export interface ThreadPhraseNote {
  id: string;
  threadId: string;
  userId: string;
  phraseNoteData: Record<string, unknown>; // PhraseNoteFile JSON
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
  liked?: boolean;
  createdAt: string;
  updatedAt: string;
  profile?: Profile;
  replies?: GeneralPost[];
}
