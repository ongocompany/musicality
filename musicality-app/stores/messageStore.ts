/**
 * Message Store — DM + Group Chat state management.
 * Follows communityStore.ts pattern (Zustand + AsyncStorage persist).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  DirectMessage,
  ChatRoom,
  ChatRoomMember,
  ChatRoomMessage,
  InboxItem,
} from '../types/message';
import * as msgApi from '../services/messageApi';

interface MessageState {
  // ─── Persisted (badge count) ────────────
  totalUnreadCount: number;

  // ─── Transient ──────────────────────────
  inboxItems: InboxItem[];
  activeConversation: DirectMessage[];
  activeRoom: ChatRoom | null;
  activeRoomMessages: ChatRoomMessage[];
  activeRoomMembers: ChatRoomMember[];

  loading: Record<string, boolean>;
  errors: Record<string, string | null>;

  // ─── Inbox ─────────────────────────────
  fetchInbox: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;

  // ─── DM ────────────────────────────────
  fetchConversation: (otherUserId: string) => Promise<void>;
  sendDM: (recipientId: string, content: string) => Promise<void>;
  markDMRead: (senderId: string) => Promise<void>;
  deleteDM: (messageId: string) => Promise<void>;

  // ─── Room ──────────────────────────────
  fetchRoom: (roomId: string) => Promise<void>;
  sendRoomMsg: (roomId: string, content: string) => Promise<void>;
  markRoomRead: (roomId: string) => Promise<void>;
  inviteMember: (roomId: string, userId: string) => Promise<void>;
  kickMember: (roomId: string, userId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  closeRoom: (roomId: string) => Promise<void>;
  createRoom: (memberIds: string[], name?: string) => Promise<string>;

  // ─── Cleanup ───────────────────────────
  clearActive: () => void;
}

function withLoading(
  set: (fn: (state: MessageState) => Partial<MessageState>) => void,
  key: string,
  fn: () => Promise<void>,
) {
  return async () => {
    set((s) => ({ loading: { ...s.loading, [key]: true }, errors: { ...s.errors, [key]: null } }));
    try {
      await fn();
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      console.warn(`[MessageStore] ${key} error:`, msg);
      set((s) => ({ errors: { ...s.errors, [key]: msg } }));
    } finally {
      set((s) => ({ loading: { ...s.loading, [key]: false } }));
    }
  };
}

export const useMessageStore = create<MessageState>()(
  persist(
    (set, get) => ({
      // ─── Initial state ────────────────
      totalUnreadCount: 0,
      inboxItems: [],
      activeConversation: [],
      activeRoom: null,
      activeRoomMessages: [],
      activeRoomMembers: [],
      loading: {},
      errors: {},

      resetAll: () => {
        set({
          totalUnreadCount: 0,
          inboxItems: [],
          activeConversation: [],
          activeRoom: null,
          activeRoomMessages: [],
          activeRoomMembers: [],
          loading: {},
          errors: {},
        });
      },

      // ─── Inbox ────────────────────────

      fetchInbox: async () => {
        await withLoading(set, 'inbox', async () => {
          const items = await msgApi.fetchUnifiedInbox();
          set({ inboxItems: items });
        })();
      },

      fetchUnreadCount: async () => {
        try {
          const count = await msgApi.fetchTotalUnreadCount();
          set({ totalUnreadCount: count });
        } catch {
          // Silently fail — badge is non-critical
        }
      },

      // ─── DM ───────────────────────────

      fetchConversation: async (otherUserId: string) => {
        await withLoading(set, 'conversation', async () => {
          const messages = await msgApi.fetchConversation(otherUserId);
          set({ activeConversation: messages });
        })();
      },

      sendDM: async (recipientId: string, content: string) => {
        await msgApi.sendMessage(recipientId, content);
        // Re-fetch conversation to include the new message
        const messages = await msgApi.fetchConversation(recipientId);
        set({ activeConversation: messages });
      },

      markDMRead: async (senderId: string) => {
        try {
          await msgApi.markMessagesRead(senderId);
          // Update unread count
          get().fetchUnreadCount();
        } catch {
          // Non-critical
        }
      },

      deleteDM: async (messageId: string) => {
        await msgApi.deleteMessage(messageId);
        // Remove from local state
        set((s) => ({
          activeConversation: s.activeConversation.filter((m) => m.id !== messageId),
        }));
      },

      // ─── Room ─────────────────────────

      fetchRoom: async (roomId: string) => {
        await withLoading(set, 'room', async () => {
          const [messages, members] = await Promise.all([
            msgApi.fetchRoomMessages(roomId),
            msgApi.fetchRoomMembers(roomId),
          ]);
          // Find room info from inbox or fetch rooms
          const inbox = get().inboxItems;
          const roomItem = inbox.find((i) => i.type === 'room' && i.room?.id === roomId);
          set({
            activeRoom: roomItem?.room ?? null,
            activeRoomMessages: messages,
            activeRoomMembers: members,
          });
        })();
      },

      sendRoomMsg: async (roomId: string, content: string) => {
        await msgApi.sendRoomMessage(roomId, content);
        // Re-fetch messages
        const messages = await msgApi.fetchRoomMessages(roomId);
        set({ activeRoomMessages: messages });
      },

      markRoomRead: async (roomId: string) => {
        try {
          await msgApi.markRoomMessagesRead(roomId);
          get().fetchUnreadCount();
        } catch {
          // Non-critical
        }
      },

      inviteMember: async (roomId: string, userId: string) => {
        await msgApi.inviteToRoom(roomId, userId);
        // Re-fetch members
        const members = await msgApi.fetchRoomMembers(roomId);
        set({ activeRoomMembers: members });
      },

      kickMember: async (roomId: string, userId: string) => {
        await msgApi.kickFromRoom(roomId, userId);
        const members = await msgApi.fetchRoomMembers(roomId);
        set({ activeRoomMembers: members });
        // Re-fetch messages (system message added)
        const messages = await msgApi.fetchRoomMessages(roomId);
        set({ activeRoomMessages: messages });
      },

      leaveRoom: async (roomId: string) => {
        await msgApi.leaveRoom(roomId);
        set({ activeRoom: null, activeRoomMessages: [], activeRoomMembers: [] });
      },

      closeRoom: async (roomId: string) => {
        await msgApi.closeRoom(roomId);
        if (get().activeRoom?.id === roomId) {
          set((s) => ({
            activeRoom: s.activeRoom ? { ...s.activeRoom, isActive: false } : null,
          }));
        }
        // Re-fetch messages (system message added)
        const messages = await msgApi.fetchRoomMessages(roomId);
        set({ activeRoomMessages: messages });
      },

      createRoom: async (memberIds: string[], name?: string) => {
        const roomId = await msgApi.createChatRoom(memberIds, name);
        return roomId;
      },

      // ─── Cleanup ──────────────────────

      clearActive: () => {
        set({
          activeConversation: [],
          activeRoom: null,
          activeRoomMessages: [],
          activeRoomMembers: [],
        });
      },
    }),
    {
      name: 'musicality-messages',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        totalUnreadCount: state.totalUnreadCount,
      }),
    },
  ),
);
