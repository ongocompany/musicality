/**
 * Community API — Web version.
 * Direct Supabase queries for crew system. RLS handles authorization.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import type {
  Profile,
  Crew,
  CrewMember,
  CreateCrewInput,
  JoinRequest,
  SongThread,
  CreateThreadInput,
  ThreadPhraseNote,
  GeneralPost,
  UserFollow,
  UserBlock,
  UserNote,
  DirectMessage,
  ConversationThread,
  UserSocialContext,
  ChatRoom,
  ChatRoomMember,
  ChatRoomMessage,
  InboxItem,
} from './types';

// ─── Mappers (snake_case → camelCase) ───────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    nickname: row.nickname ?? null,
    avatarUrl: row.avatar_url ?? null,
    phone: row.phone ?? null,
    danceStyle: row.dance_style ?? 'bachata',
    lastActiveAt: row.last_active_at ?? null,
    nicknameChangedAt: row.nickname_changed_at ?? null,
    followerCount: row.follower_count ?? 0,
    followingCount: row.following_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCrew(row: any): Crew {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    thumbnailUrl: row.thumbnail_url ?? null,
    crewType: row.crew_type,
    captainId: row.captain_id,
    memberLimit: row.member_limit,
    memberCount: row.member_count,
    danceStyle: row.dance_style ?? 'bachata',
    region: row.region ?? 'global',
    inviteCode: row.invite_code ?? '',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCrewMember(row: any): CrewMember {
  return {
    id: row.id,
    crewId: row.crew_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    profile: row.profiles ? mapProfile(row.profiles) : undefined,
  };
}

function mapJoinRequest(row: any): JoinRequest {
  return {
    id: row.id,
    crewId: row.crew_id,
    userId: row.user_id,
    status: row.status,
    message: row.message ?? '',
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    profile: row.profiles ? mapProfile(row.profiles) : undefined,
  };
}

function mapSongThread(row: any): SongThread {
  return {
    id: row.id,
    crewId: row.crew_id,
    title: row.title,
    normalizedTitle: row.normalized_title,
    youtubeId: row.youtube_id ?? null,
    bpm: row.bpm ?? null,
    danceStyle: row.dance_style ?? 'bachata',
    postCount: row.post_count ?? 0,
    lastActivityAt: row.last_activity_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapThreadPhraseNote(row: any): ThreadPhraseNote {
  return {
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    phraseNoteData: row.phrase_note_data,
    description: row.description ?? '',
    createdAt: row.created_at,
    profile: row.profiles ? mapProfile(row.profiles) : undefined,
  };
}

function mapGeneralPost(row: any): GeneralPost {
  return {
    id: row.id,
    crewId: row.crew_id,
    userId: row.user_id,
    content: row.content,
    parentId: row.parent_id ?? null,
    mediaUrls: row.media_urls ?? [],
    likeCount: row.like_count ?? 0,
    replyCount: row.reply_count ?? 0,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profile: row.profiles ? mapProfile(row.profiles) : undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Helpers ─────────────────────────────────────────────

/** Batch-fetch profiles by user IDs and return a map of userId → Profile */
export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Profile>> {
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

// ─── Profile ────────────────────────────────────────────

export async function fetchMyProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) return null;
  return mapProfile(data);
}

export async function updateProfile(
  supabase: SupabaseClient,
  updates: { displayName?: string; nickname?: string; avatarUrl?: string; phone?: string; danceStyle?: string },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const payload: Record<string, unknown> = {};
  if (updates.displayName !== undefined) payload.display_name = updates.displayName;
  if (updates.nickname !== undefined) {
    payload.nickname = updates.nickname;
    payload.nickname_changed_at = new Date().toISOString();
  }
  if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.danceStyle !== undefined) payload.dance_style = updates.danceStyle;
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
  if (error) {
    if (error.message.includes('profiles_nickname_unique')) {
      throw new Error('This nickname is already taken');
    }
    throw new Error(error.message);
  }
}

/** Check if a nickname is available */
export async function checkNicknameAvailable(supabase: SupabaseClient, nickname: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('nickname', nickname)
    .limit(1);
  return (data ?? []).length === 0;
}

// ─── Crews ──────────────────────────────────────────────

export async function fetchMyCrews(supabase: SupabaseClient): Promise<Crew[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('crew_members')
    .select('crew_id, crews(*)')
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row: any) => row.crews) // eslint-disable-line @typescript-eslint/no-explicit-any
    .map((row: any) => mapCrew(row.crews)); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function fetchDiscoverCrews(supabase: SupabaseClient, search?: string): Promise<Crew[]> {
  let query = supabase
    .from('crews')
    .select('*')
    .eq('is_active', true)
    .order('member_count', { ascending: false })
    .limit(50);

  if (search && search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCrew);
}

export async function fetchCrewById(supabase: SupabaseClient, crewId: string): Promise<Crew | null> {
  const { data, error } = await supabase
    .from('crews')
    .select('*')
    .eq('id', crewId)
    .single();

  if (error) return null;
  return mapCrew(data);
}

export async function createCrew(supabase: SupabaseClient, input: CreateCrewInput): Promise<Crew> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('crews')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      crew_type: input.crewType,
      captain_id: user.id,
      member_limit: input.memberLimit ?? 50,
      dance_style: input.danceStyle ?? 'bachata',
      region: input.region ?? 'global',
      member_count: 1,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await supabase.from('crew_members').insert({
    crew_id: data.id,
    user_id: user.id,
    role: 'captain',
  });

  return mapCrew(data);
}

export async function updateCrew(
  supabase: SupabaseClient,
  crewId: string,
  updates: Partial<Pick<Crew, 'name' | 'description' | 'crewType' | 'memberLimit' | 'thumbnailUrl' | 'region'>>,
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.description !== undefined) payload.description = updates.description.trim();
  if (updates.crewType !== undefined) payload.crew_type = updates.crewType;
  if (updates.memberLimit !== undefined) payload.member_limit = updates.memberLimit;
  if (updates.thumbnailUrl !== undefined) payload.thumbnail_url = updates.thumbnailUrl;
  if (updates.region !== undefined) payload.region = updates.region;

  const { error } = await supabase.from('crews').update(payload).eq('id', crewId);
  if (error) throw new Error(error.message);
}

// ─── Members ────────────────────────────────────────────

export async function fetchCrewMembers(supabase: SupabaseClient, crewId: string): Promise<CrewMember[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .eq('crew_id', crewId)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.user_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapCrewMember(row), profile: profileMap.get(row.user_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function joinCrew(supabase: SupabaseClient, crewId: string): Promise<void> {
  const { error } = await supabase.rpc('join_crew', { p_crew_id: crewId });
  if (error) throw new Error(error.message);
}

export async function leaveCrew(supabase: SupabaseClient, crewId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_crew', { p_crew_id: crewId });
  if (error) throw new Error(error.message);
}

export async function kickMember(supabase: SupabaseClient, crewId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('kick_member', {
    p_crew_id: crewId,
    p_target_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

/** Change a member's role (captain/moderator only) */
export async function changeMemberRole(
  supabase: SupabaseClient,
  crewId: string,
  targetUserId: string,
  newRole: string,
): Promise<void> {
  const { error } = await supabase.rpc('change_member_role', {
    p_crew_id: crewId,
    p_target_user_id: targetUserId,
    p_new_role: newRole,
  });
  if (error) throw new Error(error.message);
}

/** Transfer captainship to another member */
export async function transferCaptainship(
  supabase: SupabaseClient,
  crewId: string,
  newCaptainId: string,
): Promise<void> {
  const { error } = await supabase.rpc('transfer_captainship', {
    p_crew_id: crewId,
    p_new_captain_id: newCaptainId,
  });
  if (error) throw new Error(error.message);
}

/** Touch last_active_at on profile */
export async function touchLastActive(supabase: SupabaseClient): Promise<void> {
  await supabase.rpc('touch_last_active');
}

/** Delete the current user's account. Fails if user is captain of any crew. */
export async function deleteMyAccount(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message);
}

// ─── Join Requests ──────────────────────────────────────

export async function requestJoinCrew(supabase: SupabaseClient, crewId: string, message?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('crew_join_requests').insert({
    crew_id: crewId,
    user_id: user.id,
    message: message?.trim() ?? '',
  });
  if (error) throw new Error(error.message);
}

export async function fetchJoinRequests(supabase: SupabaseClient, crewId: string): Promise<JoinRequest[]> {
  const { data, error } = await supabase
    .from('crew_join_requests')
    .select('*')
    .eq('crew_id', crewId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.user_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapJoinRequest(row), profile: profileMap.get(row.user_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function approveJoinRequest(supabase: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_join_request', { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

export async function rejectJoinRequest(supabase: SupabaseClient, requestId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('crew_join_requests')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq('id', requestId);

  if (error) throw new Error(error.message);
}

// ─── Song Threads ───────────────────────────────────────

export async function fetchSongThreads(supabase: SupabaseClient, crewId: string): Promise<SongThread[]> {
  const { data, error } = await supabase
    .from('song_threads')
    .select('*')
    .eq('crew_id', crewId)
    .order('last_activity_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSongThread);
}

export async function createSongThread(
  supabase: SupabaseClient,
  crewId: string,
  input: CreateThreadInput,
): Promise<SongThread> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const title = input.title.trim();
  const { data, error } = await supabase
    .from('song_threads')
    .insert({
      crew_id: crewId,
      title,
      normalized_title: title.toLowerCase(),
      youtube_id: input.youtubeId ?? null,
      bpm: input.bpm ?? null,
      dance_style: input.danceStyle ?? 'bachata',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapSongThread(data);
}

// ─── Thread PhraseNotes ─────────────────────────────────

export async function fetchThreadNotes(supabase: SupabaseClient, threadId: string): Promise<ThreadPhraseNote[]> {
  const { data, error } = await supabase
    .from('thread_phrase_notes')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.user_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapThreadPhraseNote(row), profile: profileMap.get(row.user_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function postPhraseNote(
  supabase: SupabaseClient,
  threadId: string,
  phraseNoteData: Record<string, unknown>,
  description?: string,
): Promise<ThreadPhraseNote> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('thread_phrase_notes')
    .insert({
      thread_id: threadId,
      user_id: user.id,
      phrase_note_data: phraseNoteData,
      description: description?.trim() ?? '',
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  // Update thread activity
  const { count } = await supabase
    .from('thread_phrase_notes')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId);

  await supabase
    .from('song_threads')
    .update({
      last_activity_at: new Date().toISOString(),
      post_count: count ?? 0,
    })
    .eq('id', threadId);

  const profileMap = await fetchProfilesByIds(supabase, [user.id]);
  return { ...mapThreadPhraseNote(data), profile: profileMap.get(user.id) };
}

// ─── General Posts ──────────────────────────────────────

export async function fetchGeneralPosts(supabase: SupabaseClient, crewId: string): Promise<GeneralPost[]> {
  const { data, error } = await supabase
    .from('general_posts')
    .select('*')
    .eq('crew_id', crewId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.user_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapGeneralPost(row), profile: profileMap.get(row.user_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function fetchPostReplies(supabase: SupabaseClient, parentId: string): Promise<GeneralPost[]> {
  const { data, error } = await supabase
    .from('general_posts')
    .select('*')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.user_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapGeneralPost(row), profile: profileMap.get(row.user_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function createGeneralPost(
  supabase: SupabaseClient,
  crewId: string,
  content: string,
  parentId?: string,
  mediaUrls?: string[],
): Promise<GeneralPost> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('general_posts')
    .insert({
      crew_id: crewId,
      user_id: user.id,
      content: content.trim(),
      parent_id: parentId ?? null,
      media_urls: mediaUrls ?? [],
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const profileMap = await fetchProfilesByIds(supabase, [user.id]);
  return { ...mapGeneralPost(data), profile: profileMap.get(user.id) };
}

export async function deleteGeneralPost(supabase: SupabaseClient, postId: string): Promise<void> {
  const { error } = await supabase
    .from('general_posts')
    .delete()
    .eq('id', postId);

  if (error) throw new Error(error.message);
}

// ─── Likes ───────────────────────────────────────────────

/** Toggle like on a post. Returns true if now liked, false if unliked. */
export async function togglePostLike(supabase: SupabaseClient, postId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_post_like', { p_post_id: postId });
  if (error) throw new Error(error.message);
  return data as boolean;
}

/** Check which posts the current user has liked (batch). */
export async function fetchUserLikes(supabase: SupabaseClient, postIds: string[]): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || postIds.length === 0) return new Set();

  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);

  return new Set((data ?? []).map((r: any) => r.post_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── Post Media Upload ──────────────────────────────────

export async function uploadPostMedia(
  supabase: SupabaseClient,
  file: File,
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const timestamp = Date.now();
  const path = `${user.id}/${timestamp}.${ext}`;

  const { error } = await supabase.storage
    .from('post-media')
    .upload(path, file, { contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('post-media').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Storage ────────────────────────────────────────────

export async function uploadCrewThumbnail(
  supabase: SupabaseClient,
  crewId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${crewId}/thumbnail.${ext}`;

  const { error } = await supabase.storage
    .from('crew-thumbnails')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('crew-thumbnails').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function uploadProfileAvatar(
  supabase: SupabaseClient,
  file: File,
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `avatars/${user.id}.${ext}`;

  const { error } = await supabase.storage
    .from('crew-thumbnails')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('crew-thumbnails').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ─── Social Mappers ─────────────────────────────────────

function mapUserFollow(row: any): UserFollow {
  return {
    id: row.id,
    followerId: row.follower_id,
    followingId: row.following_id,
    createdAt: row.created_at,
  };
}

function mapUserBlock(row: any): UserBlock {
  return {
    id: row.id,
    blockerId: row.blocker_id,
    blockedId: row.blocked_id,
    createdAt: row.created_at,
  };
}

function mapUserNote(row: any): UserNote {
  return {
    id: row.id,
    authorId: row.author_id,
    targetUserId: row.target_user_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

// ─── Social: User Context ───────────────────────────────

export async function fetchUserSocialContext(
  supabase: SupabaseClient,
  targetUserId: string,
): Promise<UserSocialContext> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const [followRes, blockRes, noteRes, profileRes] = await Promise.all([
    supabase.from('user_follows').select('id').eq('follower_id', user.id).eq('following_id', targetUserId).maybeSingle(),
    supabase.from('user_blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', targetUserId).maybeSingle(),
    supabase.from('user_notes').select('*').eq('author_id', user.id).eq('target_user_id', targetUserId).maybeSingle(),
    supabase.from('profiles').select('follower_count, following_count').eq('id', targetUserId).single(),
  ]);

  return {
    isFollowing: !!followRes.data,
    isBlocked: !!blockRes.data,
    note: noteRes.data ? mapUserNote(noteRes.data) : null,
    followerCount: profileRes.data?.follower_count ?? 0,
    followingCount: profileRes.data?.following_count ?? 0,
  };
}

// ─── Social: Follow ─────────────────────────────────────

export async function toggleFollow(supabase: SupabaseClient, targetUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_follow', { p_target_user_id: targetUserId });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function fetchFollowers(supabase: SupabaseClient, userId: string): Promise<UserFollow[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('*')
    .eq('following_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.follower_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapUserFollow(row), profile: profileMap.get(row.follower_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function fetchFollowing(supabase: SupabaseClient, userId: string): Promise<UserFollow[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('*')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.following_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapUserFollow(row), profile: profileMap.get(row.following_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── Social: Block ──────────────────────────────────────

export async function toggleBlock(supabase: SupabaseClient, targetUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_block', { p_target_user_id: targetUserId });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function fetchBlockedUsers(supabase: SupabaseClient): Promise<UserBlock[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_blocks')
    .select('*')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.blocked_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapUserBlock(row), profile: profileMap.get(row.blocked_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── Social: Notes ──────────────────────────────────────

export async function upsertUserNote(
  supabase: SupabaseClient,
  targetUserId: string,
  content: string,
): Promise<UserNote> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_notes')
    .upsert(
      {
        author_id: user.id,
        target_user_id: targetUserId,
        content: content.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'author_id,target_user_id' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapUserNote(data);
}

export async function deleteUserNote(supabase: SupabaseClient, targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_notes')
    .delete()
    .eq('author_id', user.id)
    .eq('target_user_id', targetUserId);

  if (error) throw new Error(error.message);
}

// ─── Social: Direct Messages ────────────────────────────

export async function sendMessage(
  supabase: SupabaseClient,
  recipientId: string,
  content: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('send_message', {
    p_recipient_id: recipientId,
    p_content: content.trim(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function fetchConversations(supabase: SupabaseClient): Promise<ConversationThread[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get all messages involving the user, ordered by most recent
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Group by conversation partner
  const conversationMap = new Map<string, { messages: any[]; unread: number }>();

  for (const row of rows) {
    const isSender = row.sender_id === user.id;
    // Skip deleted messages
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

  // Fetch profiles for all conversation partners
  const otherIds = Array.from(conversationMap.keys());
  if (otherIds.length === 0) return [];

  const profileMap = await fetchProfilesByIds(supabase, otherIds);

  // Build conversation threads sorted by most recent message
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

export async function fetchConversation(
  supabase: SupabaseClient,
  otherUserId: string,
): Promise<DirectMessage[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`,
    )
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const isSender = row.sender_id === user.id;
      if (isSender && row.deleted_by_sender) return false;
      if (!isSender && row.deleted_by_recipient) return false;
      return true;
    })
    .map(mapDirectMessage);
}

export async function markMessagesRead(supabase: SupabaseClient, senderId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_messages_read', { p_sender_id: senderId });
  if (error) throw new Error(error.message);
}

export async function fetchUnreadMessageCount(supabase: SupabaseClient): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { count, error } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null)
    .eq('deleted_by_recipient', false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteMessage(supabase: SupabaseClient, messageId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Soft-delete: mark as deleted for this user
  const { data: msg } = await supabase
    .from('direct_messages')
    .select('sender_id, recipient_id')
    .eq('id', messageId)
    .single();

  if (!msg) throw new Error('Message not found');

  const update: Record<string, boolean> = {};
  if (msg.sender_id === user.id) update.deleted_by_sender = true;
  if (msg.recipient_id === user.id) update.deleted_by_recipient = true;

  if (Object.keys(update).length === 0) throw new Error('Not authorized');

  const { error } = await supabase
    .from('direct_messages')
    .update(update)
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

// ─── Group Chat Mappers ─────────────────────────────────

function mapChatRoom(row: any): ChatRoom { // eslint-disable-line @typescript-eslint/no-explicit-any
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

function mapChatRoomMember(row: any): ChatRoomMember { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    removedAt: row.removed_at ?? null,
  };
}

function mapChatRoomMessage(row: any): ChatRoomMessage { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    content: row.content,
    messageType: row.message_type,
    createdAt: row.created_at,
  };
}

// ─── Group Chat: Room Operations ─────────────────────────

export async function createChatRoom(
  supabase: SupabaseClient,
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

export async function sendRoomMessage(
  supabase: SupabaseClient,
  roomId: string,
  content: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('send_room_message', {
    p_room_id: roomId,
    p_content: content.trim(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function inviteToRoom(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('invite_to_room', {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function kickFromRoom(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('kick_from_room', {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function leaveRoom(supabase: SupabaseClient, roomId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function closeRoom(supabase: SupabaseClient, roomId: string): Promise<void> {
  const { error } = await supabase.rpc('close_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

export async function markRoomMessagesRead(supabase: SupabaseClient, roomId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_room_messages_read', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

// ─── Group Chat: Queries ─────────────────────────────────

export async function fetchRoomMessages(
  supabase: SupabaseClient,
  roomId: string,
): Promise<ChatRoomMessage[]> {
  const { data, error } = await supabase
    .from('chat_room_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const senderIds = [...new Set(rows.filter((r: any) => r.message_type === 'message').map((r: any) => r.sender_id))]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const profileMap = await fetchProfilesByIds(supabase, senderIds);

  return rows.map((row: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    ...mapChatRoomMessage(row),
    senderProfile: profileMap.get(row.sender_id),
  }));
}

export async function fetchRoomMembers(
  supabase: SupabaseClient,
  roomId: string,
): Promise<ChatRoomMember[]> {
  const { data, error } = await supabase
    .from('chat_room_members')
    .select('*')
    .eq('room_id', roomId)
    .is('removed_at', null)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(supabase, rows.map((r: any) => r.user_id)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => ({ ...mapChatRoomMember(row), profile: profileMap.get(row.user_id) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function fetchMyRooms(supabase: SupabaseClient): Promise<ChatRoom[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get room IDs where user is active member
  const { data: memberRows, error: memberErr } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', user.id)
    .is('removed_at', null);

  if (memberErr) throw new Error(memberErr.message);
  const roomIds = (memberRows ?? []).map((r: any) => r.room_id); // eslint-disable-line @typescript-eslint/no-explicit-any
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

export async function fetchUnifiedInbox(supabase: SupabaseClient): Promise<InboxItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch DM threads and room data in parallel
  const [dmThreads, rooms] = await Promise.all([
    fetchConversations(supabase),
    fetchMyRooms(supabase),
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

  // Add room items — fetch last message + members + unread for each
  if (rooms.length > 0) {
    const roomIds = rooms.map((r) => r.id);

    // Batch fetch last messages for all rooms
    const { data: lastMsgRows } = await supabase
      .from('chat_room_messages')
      .select('*')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false });

    const lastMsgByRoom = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const row of lastMsgRows ?? []) {
      if (!lastMsgByRoom.has(row.room_id)) {
        lastMsgByRoom.set(row.room_id, row);
      }
    }

    // Batch fetch members for all rooms
    const { data: memberRows } = await supabase
      .from('chat_room_members')
      .select('*')
      .in('room_id', roomIds)
      .is('removed_at', null);

    const membersByRoom = new Map<string, any[]>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const row of memberRows ?? []) {
      if (!membersByRoom.has(row.room_id)) {
        membersByRoom.set(row.room_id, []);
      }
      membersByRoom.get(row.room_id)!.push(row);
    }

    // Fetch profiles for all members
    const allMemberIds = [...new Set((memberRows ?? []).map((r: any) => r.user_id))]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const profileMap = await fetchProfilesByIds(supabase, allMemberIds);

    // Batch fetch read cursors
    const { data: readRows } = await supabase
      .from('chat_room_reads')
      .select('*')
      .eq('user_id', user.id)
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
        // Count messages after last_read_at
        const { count } = await supabase
          .from('chat_room_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .gt('created_at', lastReadAt);
        unreadCount = count ?? 0;
      } else {
        // Never read — all messages are unread
        const { count } = await supabase
          .from('chat_room_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
          .eq('message_type', 'message');
        unreadCount = count ?? 0;
      }

      const lastMsgRow = lastMsgByRoom.get(room.id);
      const members = (membersByRoom.get(room.id) ?? []).map((row: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
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

export async function fetchTotalUnreadCount(supabase: SupabaseClient): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  // DM unread count
  const { count: dmCount } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null)
    .eq('deleted_by_recipient', false);

  // Room unread count: sum of unread messages across all rooms
  let roomUnread = 0;

  const { data: memberRows } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', user.id)
    .is('removed_at', null);

  const roomIds = (memberRows ?? []).map((r: any) => r.room_id); // eslint-disable-line @typescript-eslint/no-explicit-any

  if (roomIds.length > 0) {
    // Check which rooms are active
    const { data: activeRooms } = await supabase
      .from('chat_rooms')
      .select('id')
      .in('id', roomIds)
      .eq('is_active', true);

    const activeRoomIds = (activeRooms ?? []).map((r: any) => r.id); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (activeRoomIds.length > 0) {
      // Get read cursors
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
