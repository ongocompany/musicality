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
} from './types';

// ─── Mappers (snake_case → camelCase) ───────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    avatarUrl: row.avatar_url ?? null,
    danceStyle: row.dance_style ?? 'bachata',
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profile: row.profiles ? mapProfile(row.profiles) : undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Helpers ─────────────────────────────────────────────

/** Batch-fetch profiles by user IDs and return a map of userId → Profile */
async function fetchProfilesByIds(
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
  updates: { displayName?: string; avatarUrl?: string; danceStyle?: string },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const payload: Record<string, unknown> = {};
  if (updates.displayName !== undefined) payload.display_name = updates.displayName;
  if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
  if (updates.danceStyle !== undefined) payload.dance_style = updates.danceStyle;
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
  if (error) throw new Error(error.message);
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
  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', userId)
    .neq('role', 'captain');

  if (error) throw new Error(error.message);
  await supabase.rpc('leave_crew', { p_crew_id: crewId });
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
