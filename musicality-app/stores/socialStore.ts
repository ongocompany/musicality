/**
 * Social Store — Profile, follow, block, notes state management.
 * No persistence (always fresh fetch from Supabase).
 */
import { create } from 'zustand';
import type { Profile, UserFollow, UserBlock, UserSocialContext } from '../types/community';
import { fetchMyProfile, updateProfile as apiUpdateProfile } from '../services/communityApi';
import * as socialApi from '../services/socialApi';

interface SocialState {
  // My profile
  myProfile: Profile | null;
  myProfileLoading: boolean;

  // Viewing another user
  viewingProfile: Profile | null;
  viewingSocialContext: UserSocialContext | null;
  viewingLoading: boolean;

  // Follow lists
  followers: UserFollow[];
  following: UserFollow[];
  followListLoading: boolean;

  // Blocked users
  blockedUsers: UserBlock[];
  blockedLoading: boolean;

  // Actions
  fetchMyProfile: () => Promise<void>;
  updateMyProfile: (updates: {
    displayName?: string;
    nickname?: string;
    avatarUrl?: string;
    phone?: string;
    danceStyle?: string;
  }) => Promise<void>;

  fetchUserProfile: (userId: string) => Promise<void>;
  fetchSocialContext: (targetUserId: string) => Promise<void>;

  toggleFollow: (targetUserId: string) => Promise<boolean>;
  toggleBlock: (targetUserId: string) => Promise<boolean>;

  upsertNote: (targetUserId: string, content: string) => Promise<void>;
  deleteNote: (targetUserId: string) => Promise<void>;

  fetchFollowers: (userId: string) => Promise<void>;
  fetchFollowing: (userId: string) => Promise<void>;
  fetchBlockedUsers: () => Promise<void>;

  clearViewing: () => void;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  myProfile: null,
  myProfileLoading: false,
  viewingProfile: null,
  viewingSocialContext: null,
  viewingLoading: false,
  followers: [],
  following: [],
  followListLoading: false,
  blockedUsers: [],
  blockedLoading: false,

  fetchMyProfile: async () => {
    set({ myProfileLoading: true });
    try {
      const profile = await fetchMyProfile();
      set({ myProfile: profile });
    } catch (e) {
      console.warn('[SocialStore] fetchMyProfile error:', e);
    } finally {
      set({ myProfileLoading: false });
    }
  },

  updateMyProfile: async (updates) => {
    await apiUpdateProfile(updates);
    // Re-fetch to get updated data
    const profile = await fetchMyProfile();
    set({ myProfile: profile });
  },

  fetchUserProfile: async (userId) => {
    set({ viewingLoading: true });
    try {
      const profile = await socialApi.fetchUserProfile(userId);
      set({ viewingProfile: profile });
    } catch (e) {
      console.warn('[SocialStore] fetchUserProfile error:', e);
    } finally {
      set({ viewingLoading: false });
    }
  },

  fetchSocialContext: async (targetUserId) => {
    try {
      const ctx = await socialApi.fetchUserSocialContext(targetUserId);
      set({ viewingSocialContext: ctx });
    } catch (e) {
      console.warn('[SocialStore] fetchSocialContext error:', e);
    }
  },

  toggleFollow: async (targetUserId) => {
    const isNowFollowing = await socialApi.toggleFollow(targetUserId);
    // Update viewing context
    const ctx = get().viewingSocialContext;
    if (ctx) {
      set({
        viewingSocialContext: {
          ...ctx,
          isFollowing: isNowFollowing,
          followerCount: ctx.followerCount + (isNowFollowing ? 1 : -1),
        },
      });
    }
    // Update my profile counts
    const my = get().myProfile;
    if (my) {
      set({
        myProfile: {
          ...my,
          followingCount: my.followingCount + (isNowFollowing ? 1 : -1),
        },
      });
    }
    return isNowFollowing;
  },

  toggleBlock: async (targetUserId) => {
    const isNowBlocked = await socialApi.toggleBlock(targetUserId);
    // Update viewing context — block auto-unfollows
    const ctx = get().viewingSocialContext;
    if (ctx) {
      set({
        viewingSocialContext: {
          ...ctx,
          isBlocked: isNowBlocked,
          isFollowing: isNowBlocked ? false : ctx.isFollowing,
        },
      });
    }
    return isNowBlocked;
  },

  upsertNote: async (targetUserId, content) => {
    const note = await socialApi.upsertUserNote(targetUserId, content);
    const ctx = get().viewingSocialContext;
    if (ctx) {
      set({ viewingSocialContext: { ...ctx, note } });
    }
  },

  deleteNote: async (targetUserId) => {
    await socialApi.deleteUserNote(targetUserId);
    const ctx = get().viewingSocialContext;
    if (ctx) {
      set({ viewingSocialContext: { ...ctx, note: null } });
    }
  },

  fetchFollowers: async (userId) => {
    set({ followListLoading: true });
    try {
      const followers = await socialApi.fetchFollowers(userId);
      set({ followers });
    } catch (e) {
      console.warn('[SocialStore] fetchFollowers error:', e);
    } finally {
      set({ followListLoading: false });
    }
  },

  fetchFollowing: async (userId) => {
    set({ followListLoading: true });
    try {
      const following = await socialApi.fetchFollowing(userId);
      set({ following });
    } catch (e) {
      console.warn('[SocialStore] fetchFollowing error:', e);
    } finally {
      set({ followListLoading: false });
    }
  },

  fetchBlockedUsers: async () => {
    set({ blockedLoading: true });
    try {
      const blockedUsers = await socialApi.fetchBlockedUsers();
      set({ blockedUsers });
    } catch (e) {
      console.warn('[SocialStore] fetchBlockedUsers error:', e);
    } finally {
      set({ blockedLoading: false });
    }
  },

  clearViewing: () => {
    set({ viewingProfile: null, viewingSocialContext: null, followers: [], following: [] });
  },
}));
