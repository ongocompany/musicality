/**
 * Community Store — Crew system state management.
 * Follows existing Zustand + AsyncStorage persist pattern.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Crew,
  CrewMember,
  JoinRequest,
  SongThread,
  ThreadPhraseNote,
  GeneralPost,
  CreateCrewInput,
  CreateThreadInput,
} from '../types/community';
import * as api from '../services/communityApi';

interface CommunityState {
  // ─── Persisted (cached for offline) ───
  myCrewIds: string[];
  crewCache: Record<string, Crew>;

  // ─── Transient ────────────────────────
  discoverCrews: Crew[];
  activeCrewId: string | null;
  activeCrewMembers: CrewMember[];
  activeSongThreads: SongThread[];
  activeGeneralPosts: GeneralPost[];
  activePendingRequests: JoinRequest[];
  activeThreadNotes: Record<string, ThreadPhraseNote[]>;

  loading: Record<string, boolean>;
  errors: Record<string, string | null>;

  // ─── Crew Lifecycle ───────────────────
  fetchMyCrews: () => Promise<void>;
  fetchDiscoverCrews: (search?: string) => Promise<void>;
  createCrew: (input: CreateCrewInput) => Promise<string>;
  joinCrew: (crewId: string) => Promise<void>;
  leaveCrew: (crewId: string) => Promise<void>;
  requestJoinCrew: (crewId: string, message?: string) => Promise<void>;

  // ─── Crew Detail ──────────────────────
  setActiveCrew: (crewId: string | null) => void;
  fetchCrewDetail: (crewId: string) => Promise<void>;
  fetchCrewMembers: (crewId: string) => Promise<void>;

  // ─── Song Threads ─────────────────────
  fetchSongThreads: (crewId: string) => Promise<void>;
  createSongThread: (crewId: string, input: CreateThreadInput) => Promise<string>;
  fetchThreadNotes: (threadId: string) => Promise<void>;
  postPhraseNote: (threadId: string, data: Record<string, unknown>, description?: string) => Promise<void>;

  // ─── General Board ────────────────────
  fetchGeneralPosts: (crewId: string) => Promise<void>;
  createGeneralPost: (crewId: string, content: string, parentId?: string, mediaUrls?: string[]) => Promise<void>;
  deleteGeneralPost: (postId: string) => Promise<void>;
  togglePostLike: (postId: string) => Promise<void>;
  fetchPostReplies: (parentId: string) => Promise<GeneralPost[]>;

  // ─── Captain Management ───────────────
  fetchJoinRequests: (crewId: string) => Promise<void>;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  kickMember: (crewId: string, userId: string) => Promise<void>;
  updateCrew: (crewId: string, updates: Parameters<typeof api.updateCrew>[1]) => Promise<void>;
}

// Helper to set loading/error state
function withLoading(
  set: (fn: (state: CommunityState) => Partial<CommunityState>) => void,
  key: string,
  fn: () => Promise<void>,
) {
  return async () => {
    set((s) => ({ loading: { ...s.loading, [key]: true }, errors: { ...s.errors, [key]: null } }));
    try {
      await fn();
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      console.warn(`[CommunityStore] ${key} error:`, msg);
      set((s) => ({ errors: { ...s.errors, [key]: msg } }));
    } finally {
      set((s) => ({ loading: { ...s.loading, [key]: false } }));
    }
  };
}

export const useCommunityStore = create<CommunityState>()(
  persist(
    (set, get) => ({
      // ─── Initial state ────────────────
      myCrewIds: [],
      crewCache: {},
      discoverCrews: [],
      activeCrewId: null,
      activeCrewMembers: [],
      activeSongThreads: [],
      activeGeneralPosts: [],
      activePendingRequests: [],
      activeThreadNotes: {},
      loading: {},
      errors: {},

      // ─── Crew Lifecycle ───────────────

      fetchMyCrews: async () => {
        await withLoading(set, 'myCrews', async () => {
          const crews = await api.fetchMyCrews();
          const cache = { ...get().crewCache };
          const ids: string[] = [];
          for (const crew of crews) {
            cache[crew.id] = crew;
            ids.push(crew.id);
          }
          set({ myCrewIds: ids, crewCache: cache });
        })();
      },

      fetchDiscoverCrews: async (search?: string) => {
        await withLoading(set, 'discover', async () => {
          const crews = await api.fetchDiscoverCrews(search);
          set({ discoverCrews: crews });
        })();
      },

      createCrew: async (input: CreateCrewInput) => {
        let crewId = '';
        await withLoading(set, 'createCrew', async () => {
          const crew = await api.createCrew(input);
          crewId = crew.id;
          set((s) => ({
            myCrewIds: [...s.myCrewIds, crew.id],
            crewCache: { ...s.crewCache, [crew.id]: crew },
          }));
        })();
        return crewId;
      },

      joinCrew: async (crewId: string) => {
        await withLoading(set, 'joinCrew', async () => {
          await api.joinCrew(crewId);
          // Refresh crew data
          const crew = await api.fetchCrewById(crewId);
          if (crew) {
            set((s) => ({
              myCrewIds: s.myCrewIds.includes(crewId) ? s.myCrewIds : [...s.myCrewIds, crewId],
              crewCache: { ...s.crewCache, [crewId]: crew },
            }));
          }
        })();
      },

      leaveCrew: async (crewId: string) => {
        await withLoading(set, 'leaveCrew', async () => {
          await api.leaveCrew(crewId);
          set((s) => ({
            myCrewIds: s.myCrewIds.filter((id) => id !== crewId),
          }));
        })();
      },

      requestJoinCrew: async (crewId: string, message?: string) => {
        await withLoading(set, 'requestJoin', async () => {
          await api.requestJoinCrew(crewId, message);
        })();
      },

      // ─── Crew Detail ──────────────────

      setActiveCrew: (crewId: string | null) => {
        set({
          activeCrewId: crewId,
          activeCrewMembers: [],
          activeSongThreads: [],
          activeGeneralPosts: [],
          activePendingRequests: [],
        });
      },

      fetchCrewDetail: async (crewId: string) => {
        await withLoading(set, 'crewDetail', async () => {
          const crew = await api.fetchCrewById(crewId);
          if (crew) {
            set((s) => ({
              activeCrewId: crewId,
              crewCache: { ...s.crewCache, [crewId]: crew },
            }));
          }
        })();
      },

      fetchCrewMembers: async (crewId: string) => {
        await withLoading(set, 'crewMembers', async () => {
          const members = await api.fetchCrewMembers(crewId);
          set({ activeCrewMembers: members });
        })();
      },

      // ─── Song Threads ─────────────────

      fetchSongThreads: async (crewId: string) => {
        await withLoading(set, 'songThreads', async () => {
          const threads = await api.fetchSongThreads(crewId);
          set({ activeSongThreads: threads });
        })();
      },

      createSongThread: async (crewId: string, input: CreateThreadInput) => {
        let threadId = '';
        await withLoading(set, 'createThread', async () => {
          const thread = await api.createSongThread(crewId, input);
          threadId = thread.id;
          set((s) => ({
            activeSongThreads: [thread, ...s.activeSongThreads],
          }));
        })();
        return threadId;
      },

      fetchThreadNotes: async (threadId: string) => {
        await withLoading(set, `threadNotes_${threadId}`, async () => {
          const notes = await api.fetchThreadNotes(threadId);
          set((s) => ({
            activeThreadNotes: { ...s.activeThreadNotes, [threadId]: notes },
          }));
        })();
      },

      postPhraseNote: async (threadId: string, data: Record<string, unknown>, description?: string) => {
        await withLoading(set, 'postNote', async () => {
          const note = await api.postPhraseNote(threadId, data, description);
          set((s) => ({
            activeThreadNotes: {
              ...s.activeThreadNotes,
              [threadId]: [note, ...(s.activeThreadNotes[threadId] ?? [])],
            },
          }));
        })();
      },

      // ─── General Board ────────────────

      fetchGeneralPosts: async (crewId: string) => {
        await withLoading(set, 'generalPosts', async () => {
          const posts = await api.fetchGeneralPosts(crewId);
          // Batch-fetch user likes
          const postIds = posts.map((p) => p.id);
          const likedSet = await api.fetchUserLikes(postIds);
          const withLikes = posts.map((p) => ({ ...p, liked: likedSet.has(p.id) }));
          set({ activeGeneralPosts: withLikes });
        })();
      },

      createGeneralPost: async (crewId: string, content: string, parentId?: string, mediaUrls?: string[]) => {
        // Don't use withLoading — let errors propagate to PostComposer
        const post = await api.createGeneralPost(crewId, content, parentId, mediaUrls);
        if (!parentId) {
          set((s) => ({
            activeGeneralPosts: [post, ...s.activeGeneralPosts],
          }));
        }
      },

      deleteGeneralPost: async (postId: string) => {
        await api.deleteGeneralPost(postId);
        set((s) => ({
          activeGeneralPosts: s.activeGeneralPosts.filter((p) => p.id !== postId),
        }));
      },

      togglePostLike: async (postId: string) => {
        // Optimistic update
        set((s) => ({
          activeGeneralPosts: s.activeGeneralPosts.map((p) =>
            p.id === postId
              ? { ...p, liked: !p.liked, likeCount: p.likeCount + (p.liked ? -1 : 1) }
              : p,
          ),
        }));
        try {
          await api.togglePostLike(postId);
        } catch {
          // Revert on error
          set((s) => ({
            activeGeneralPosts: s.activeGeneralPosts.map((p) =>
              p.id === postId
                ? { ...p, liked: !p.liked, likeCount: p.likeCount + (p.liked ? -1 : 1) }
                : p,
            ),
          }));
        }
      },

      fetchPostReplies: async (parentId: string): Promise<GeneralPost[]> => {
        const replies = await api.fetchPostReplies(parentId);
        return replies;
      },

      // ─── Captain Management ───────────

      fetchJoinRequests: async (crewId: string) => {
        await withLoading(set, 'joinRequests', async () => {
          const requests = await api.fetchJoinRequests(crewId);
          set({ activePendingRequests: requests });
        })();
      },

      approveRequest: async (requestId: string) => {
        await withLoading(set, 'approveRequest', async () => {
          await api.approveJoinRequest(requestId);
          set((s) => ({
            activePendingRequests: s.activePendingRequests.filter((r) => r.id !== requestId),
          }));
          // Refresh members if active crew
          const { activeCrewId } = get();
          if (activeCrewId) {
            const members = await api.fetchCrewMembers(activeCrewId);
            set({ activeCrewMembers: members });
          }
        })();
      },

      rejectRequest: async (requestId: string) => {
        await withLoading(set, 'rejectRequest', async () => {
          await api.rejectJoinRequest(requestId);
          set((s) => ({
            activePendingRequests: s.activePendingRequests.filter((r) => r.id !== requestId),
          }));
        })();
      },

      kickMember: async (crewId: string, userId: string) => {
        await withLoading(set, 'kickMember', async () => {
          await api.kickMember(crewId, userId);
          set((s) => ({
            activeCrewMembers: s.activeCrewMembers.filter((m) => m.userId !== userId),
          }));
        })();
      },

      updateCrew: async (crewId: string, updates) => {
        await withLoading(set, 'updateCrew', async () => {
          await api.updateCrew(crewId, updates);
          const crew = await api.fetchCrewById(crewId);
          if (crew) {
            set((s) => ({
              crewCache: { ...s.crewCache, [crewId]: crew },
            }));
          }
        })();
      },
    }),
    {
      name: 'musicality-community',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        myCrewIds: state.myCrewIds,
        crewCache: state.crewCache,
      }),
    },
  ),
);
