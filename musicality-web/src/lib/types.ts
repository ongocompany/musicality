/**
 * Community types — shared with mobile app.
 * All types map to Supabase tables (snake_case → camelCase).
 */

// ─── Profile ────────────────────────────────────────────
export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  danceStyle: string;
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
export type MemberRole = 'captain' | 'member';

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
