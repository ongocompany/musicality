/**
 * Social API — Follow, Block, Notes, Profile avatar upload.
 * Ported from musicality-web/src/lib/api.ts social functions.
 */
import { supabase } from '../lib/supabase';
import { mapProfile, fetchProfilesByIds } from './communityApi';
import type { Profile, UserFollow, UserBlock, UserNote, UserSocialContext } from '../types/community';

// ─── Mappers ────────────────────────────────────────────

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

// ─── Social Context ─────────────────────────────────────

export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return mapProfile(data);
}

export async function fetchUserSocialContext(targetUserId: string): Promise<UserSocialContext> {
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

// ─── Follow ─────────────────────────────────────────────

/** Toggle follow. Returns true if now following, false if unfollowed. */
export async function toggleFollow(targetUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_follow', { p_target_user_id: targetUserId });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function fetchFollowers(userId: string): Promise<UserFollow[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('*')
    .eq('following_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(rows.map((r: any) => r.follower_id));
  return rows.map((row: any) => ({ ...mapUserFollow(row), profile: profileMap.get(row.follower_id) }));
}

export async function fetchFollowing(userId: string): Promise<UserFollow[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('*')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(rows.map((r: any) => r.following_id));
  return rows.map((row: any) => ({ ...mapUserFollow(row), profile: profileMap.get(row.following_id) }));
}

// ─── Block ──────────────────────────────────────────────

/** Toggle block. Returns true if now blocked, false if unblocked. Auto-unfollows both ways. */
export async function toggleBlock(targetUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_block', { p_target_user_id: targetUserId });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function fetchBlockedUsers(): Promise<UserBlock[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_blocks')
    .select('*')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profileMap = await fetchProfilesByIds(rows.map((r: any) => r.blocked_id));
  return rows.map((row: any) => ({ ...mapUserBlock(row), profile: profileMap.get(row.blocked_id) }));
}

// ─── Notes ──────────────────────────────────────────────

export async function upsertUserNote(targetUserId: string, content: string): Promise<UserNote> {
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

export async function deleteUserNote(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_notes')
    .delete()
    .eq('author_id', user.id)
    .eq('target_user_id', targetUserId);

  if (error) throw new Error(error.message);
}
