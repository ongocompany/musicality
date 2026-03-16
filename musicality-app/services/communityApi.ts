/**
 * Community API — Direct Supabase queries for crew system.
 * RLS policies handle authorization; no FastAPI proxy needed.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
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
} from '../types/community';

// ─── Helpers ────────────────────────────────────────────

/** Map Supabase snake_case row to camelCase Profile */
export function mapProfile(row: any): Profile {
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    nickname: row.nickname ?? null,
    avatarUrl: row.avatar_url ?? null,
    phone: row.phone ?? null,
    danceStyle: row.dance_style ?? 'bachata',
    followerCount: row.follower_count ?? 0,
    followingCount: row.following_count ?? 0,
    lastActiveAt: row.last_active_at ?? null,
    nicknameChangedAt: row.nickname_changed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Batch-fetch profiles by user IDs */
export async function fetchProfilesByIds(userIds: string[]): Promise<Map<string, Profile>> {
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

/** Map Supabase snake_case row to camelCase Crew */
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

/** Map Supabase row to CrewMember */
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

/** Map Supabase row to JoinRequest */
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

/** Map Supabase row to SongThread */
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

/** Map Supabase row to ThreadPhraseNote */
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

/** Safely parse media_urls — handles array, JSON string, or null */
function parseMediaUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

/** Map Supabase row to GeneralPost */
function mapGeneralPost(row: any): GeneralPost {
  return {
    id: row.id,
    crewId: row.crew_id,
    userId: row.user_id,
    content: row.content,
    parentId: row.parent_id ?? null,
    mediaUrls: parseMediaUrls(row.media_urls),
    likeCount: row.like_count ?? 0,
    replyCount: row.reply_count ?? 0,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profile: row.profiles ? mapProfile(row.profiles) : undefined,
  };
}

// ─── Profile ────────────────────────────────────────────

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.warn('[CommunityApi] fetchMyProfile error:', error.message);
    return null;
  }
  return mapProfile(data);
}

export async function updateProfile(updates: {
  displayName?: string;
  nickname?: string;
  avatarUrl?: string;
  phone?: string;
  danceStyle?: string;
}): Promise<void> {
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
export async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('nickname', nickname)
    .limit(1);
  return (data ?? []).length === 0;
}

// ─── Crews ──────────────────────────────────────────────

export async function fetchMyCrews(): Promise<Crew[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('crew_members')
    .select('crew_id, crews(*)')
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row: any) => row.crews)
    .map((row: any) => mapCrew(row.crews));
}

export async function fetchDiscoverCrews(search?: string): Promise<Crew[]> {
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

export async function fetchCrewById(crewId: string): Promise<Crew | null> {
  const { data, error } = await supabase
    .from('crews')
    .select('*')
    .eq('id', crewId)
    .single();

  if (error) return null;
  return mapCrew(data);
}

export async function createCrew(input: CreateCrewInput): Promise<Crew> {
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

  // Also insert captain as member
  await supabase.from('crew_members').insert({
    crew_id: data.id,
    user_id: user.id,
    role: 'captain',
  });

  return mapCrew(data);
}

export async function updateCrew(crewId: string, updates: Partial<Pick<Crew, 'name' | 'description' | 'crewType' | 'memberLimit' | 'thumbnailUrl' | 'region'>>): Promise<void> {
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

export async function fetchCrewMembers(crewId: string): Promise<CrewMember[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .eq('crew_id', crewId)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(error.message);
  const members = (data ?? []).map(mapCrewMember);
  if (members.length === 0) return members;
  const userIds = [...new Set(members.map((m) => m.userId))];
  const profileMap = await fetchProfilesByIds(userIds);
  return members.map((m) => ({ ...m, profile: profileMap.get(m.userId) }));
}

/** Join open crew via DB function (atomic) */
export async function joinCrew(crewId: string): Promise<void> {
  const { error } = await supabase.rpc('join_crew', { p_crew_id: crewId });
  if (error) throw new Error(error.message);
}

/** Leave crew via DB function (atomic) */
export async function leaveCrew(crewId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_crew', { p_crew_id: crewId });
  if (error) throw new Error(error.message);
}

/** Captain kicks a member */
export async function kickMember(crewId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', userId)
    .neq('role', 'captain');

  if (error) throw new Error(error.message);

  // Decrement member count
  await supabase.rpc('leave_crew', { p_crew_id: crewId });
}

// ─── Join Requests ──────────────────────────────────────

export async function requestJoinCrew(crewId: string, message?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('crew_join_requests').insert({
    crew_id: crewId,
    user_id: user.id,
    message: message?.trim() ?? '',
  });
  if (error) throw new Error(error.message);
}

export async function fetchJoinRequests(crewId: string): Promise<JoinRequest[]> {
  const { data, error } = await supabase
    .from('crew_join_requests')
    .select('*')
    .eq('crew_id', crewId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const requests = (data ?? []).map(mapJoinRequest);
  if (requests.length === 0) return requests;
  const userIds = [...new Set(requests.map((r) => r.userId))];
  const profileMap = await fetchProfilesByIds(userIds);
  return requests.map((r) => ({ ...r, profile: profileMap.get(r.userId) }));
}

export async function approveJoinRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_join_request', { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

export async function rejectJoinRequest(requestId: string): Promise<void> {
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

export async function fetchSongThreads(crewId: string): Promise<SongThread[]> {
  const { data, error } = await supabase
    .from('song_threads')
    .select('*, thread_phrase_notes(phrase_note_data)')
    .eq('crew_id', crewId)
    .order('last_activity_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const thread = mapSongThread(row);
    // Extract latest note format from joined notes
    const notes = row.thread_phrase_notes as any[] | undefined;
    if (notes && notes.length > 0) {
      const latest = notes[notes.length - 1];
      thread.latestNoteFormat = latest?.phrase_note_data?.format ?? 'pnote';
    }
    return thread;
  });
}

export async function createSongThread(crewId: string, input: CreateThreadInput): Promise<SongThread> {
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

export async function fetchThreadNotes(threadId: string): Promise<ThreadPhraseNote[]> {
  const { data, error } = await supabase
    .from('thread_phrase_notes')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const notes = (data ?? []).map(mapThreadPhraseNote);
  if (notes.length === 0) return notes;
  const userIds = [...new Set(notes.map((n) => n.userId))];
  const profileMap = await fetchProfilesByIds(userIds);
  return notes.map((n) => ({ ...n, profile: profileMap.get(n.userId) }));
}

export async function postPhraseNote(
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

  // Update thread activity + post count
  await supabase
    .from('song_threads')
    .update({
      last_activity_at: new Date().toISOString(),
      post_count: await getThreadPostCount(threadId),
    })
    .eq('id', threadId);

  const note = mapThreadPhraseNote(data);
  const profileMap = await fetchProfilesByIds([note.userId]);
  note.profile = profileMap.get(note.userId);
  return note;
}

async function getThreadPostCount(threadId: string): Promise<number> {
  const { count } = await supabase
    .from('thread_phrase_notes')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId);
  return count ?? 0;
}

// ─── General Posts ──────────────────────────────────────

/** Attach profiles to posts via batch fetch (avoids FK join issues) */
async function attachProfilesToPosts(posts: GeneralPost[]): Promise<GeneralPost[]> {
  if (posts.length === 0) return posts;
  const userIds = [...new Set(posts.map((p) => p.userId))];
  const profileMap = await fetchProfilesByIds(userIds);
  return posts.map((p) => ({ ...p, profile: profileMap.get(p.userId) }));
}

export async function fetchGeneralPosts(crewId: string): Promise<GeneralPost[]> {
  const { data, error } = await supabase
    .from('general_posts')
    .select('*')
    .eq('crew_id', crewId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  const posts = (data ?? []).map(mapGeneralPost);
  return attachProfilesToPosts(posts);
}

export async function fetchPostReplies(parentId: string): Promise<GeneralPost[]> {
  const { data, error } = await supabase
    .from('general_posts')
    .select('*')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const posts = (data ?? []).map(mapGeneralPost);
  return attachProfilesToPosts(posts);
}

export async function createGeneralPost(
  crewId: string,
  content: string,
  parentId?: string,
  mediaUrls?: string[],
): Promise<GeneralPost> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const insertPayload: Record<string, unknown> = {
    crew_id: crewId,
    user_id: user.id,
    content: content.trim(),
    parent_id: parentId ?? null,
  };
  if (mediaUrls && mediaUrls.length > 0) {
    insertPayload.media_urls = mediaUrls;
  }

  const { data, error } = await supabase
    .from('general_posts')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const post = mapGeneralPost(data);
  // Attach current user's profile
  const profileMap = await fetchProfilesByIds([post.userId]);
  post.profile = profileMap.get(post.userId);
  return post;
}

export async function deleteGeneralPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('general_posts')
    .delete()
    .eq('id', postId);

  if (error) throw new Error(error.message);
}

export async function togglePostLike(postId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_post_like', {
    p_post_id: postId,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function fetchUserLikes(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);

  if (error) return new Set();
  return new Set((data ?? []).map((r: any) => r.post_id));
}

export async function uploadPostMedia(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  const path = `posts/${user.id}/${Date.now()}.${ext}`;
  // Reuse crew-thumbnails bucket (guaranteed to exist)
  return uploadImage('crew-thumbnails', path, uri);
}

// ─── Storage ────────────────────────────────────────────

/** Upload image using base64 via expo-file-system (reliable in React Native) */
async function uploadImage(bucket: string, path: string, imageUri: string): Promise<string> {
  const ext = imageUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const fullPath = path.includes('.') ? path : `${path}.${ext}`;

  // Read file as base64 using expo-file-system (fetch() fails for local URIs on iOS)
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: 'base64',
  });

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fullPath, decode(base64), { upsert: true, contentType });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function uploadCrewThumbnail(crewId: string, imageUri: string): Promise<string> {
  const ext = imageUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  return uploadImage('crew-thumbnails', `${crewId}/thumbnail.${ext}`, imageUri);
}

export async function uploadProfileAvatar(imageUri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const ext = imageUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  return uploadImage('crew-thumbnails', `avatars/${user.id}.${ext}`, imageUri);
}
