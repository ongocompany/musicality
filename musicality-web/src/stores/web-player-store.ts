import { create } from 'zustand';
import type { PlayerTrack, TrackAnalysis } from '@/lib/types';

// ─── Types ────────────────────────────────────────────

export type MediaType = 'audio' | 'video' | 'youtube';
export type SortField = 'addedAt' | 'title' | 'bpm' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface Folder {
  id: string;
  name: string;
  mediaType: MediaType;
  createdAt: number; // timestamp ms
}

// ─── Local track (file loaded in browser, not yet synced) ────
export interface LocalTrack {
  id: string;
  title: string;
  mediaType: MediaType;
  fileUrl: string;          // Object URL from File API
  file?: File;              // Original file reference
  duration: number | null;
  fileSize: number | null;
  format: string | null;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  addedAt?: number;         // timestamp ms
  folderId?: string;        // undefined = root (uncategorized)
  // Analysis (from server or Supabase)
  analysis?: TrackAnalysis;
  analysisStatus: 'idle' | 'analyzing' | 'done' | 'error';
  // Supabase sync
  remoteTrack?: PlayerTrack;
}

interface WebPlayerState {
  // Library
  tracks: LocalTrack[];
  addTrack: (track: LocalTrack) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<LocalTrack>) => void;

  // Folders
  folders: Folder[];
  createFolder: (name: string, mediaType: MediaType) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveTracksToFolder: (trackIds: string[], folderId: string | undefined) => void;

  // Sorting
  sortBy: SortField;
  sortOrder: SortOrder;
  setSortBy: (field: SortField) => void;
  setSortOrder: (order: SortOrder) => void;

  // Playback
  currentTrack: LocalTrack | null;
  setCurrentTrack: (track: LocalTrack | null) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  position: number;   // ms
  setPosition: (pos: number) => void;
  duration: number;   // ms
  setDuration: (dur: number) => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;

  // Seeking
  isSeeking: boolean;
  setIsSeeking: (seeking: boolean) => void;

  // Loop (A-B repeat)
  loopEnabled: boolean;
  loopStart: number | null;  // ms
  loopEnd: number | null;    // ms
  setLoopStart: (pos: number | null) => void;
  setLoopEnd: (pos: number | null) => void;
  toggleLoop: () => void;
  clearLoop: () => void;
}

export const useWebPlayerStore = create<WebPlayerState>()((set) => ({
  // Library
  tracks: [],
  addTrack: (track) =>
    set((state) => ({
      tracks: [...state.tracks, { ...track, addedAt: track.addedAt ?? Date.now() }],
    })),
  removeTrack: (id) =>
    set((state) => {
      const track = state.tracks.find((t) => t.id === id);
      // Revoke object URL to free memory
      if (track?.fileUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(track.fileUrl);
      }
      return {
        tracks: state.tracks.filter((t) => t.id !== id),
        currentTrack: state.currentTrack?.id === id ? null : state.currentTrack,
      };
    }),
  updateTrack: (id, updates) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
      currentTrack:
        state.currentTrack?.id === id
          ? { ...state.currentTrack, ...updates }
          : state.currentTrack,
    })),

  // Folders
  folders: [],
  createFolder: (name, mediaType) => {
    const id = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      folders: [...state.folders, { id, name, mediaType, createdAt: Date.now() }],
    }));
    return id;
  },
  renameFolder: (id, name) =>
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    })),
  deleteFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      // Move contained tracks to root
      tracks: state.tracks.map((t) =>
        t.folderId === id ? { ...t, folderId: undefined } : t,
      ),
    })),
  moveTracksToFolder: (trackIds, folderId) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        trackIds.includes(t.id) ? { ...t, folderId } : t,
      ),
    })),

  // Sorting
  sortBy: 'addedAt',
  sortOrder: 'desc',
  setSortBy: (field) => set({ sortBy: field }),
  setSortOrder: (order) => set({ sortOrder: order }),

  // Playback
  currentTrack: null,
  setCurrentTrack: (track) =>
    set({
      currentTrack: track,
      position: 0,
      isPlaying: false,
      loopEnabled: false,
      loopStart: null,
      loopEnd: null,
    }),
  isPlaying: false,
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  position: 0,
  setPosition: (pos) => set({ position: pos }),
  duration: 0,
  setDuration: (dur) => set({ duration: dur }),
  playbackRate: 1.0,
  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  // Seeking
  isSeeking: false,
  setIsSeeking: (seeking) => set({ isSeeking: seeking }),

  // Loop
  loopEnabled: false,
  loopStart: null,
  loopEnd: null,
  setLoopStart: (pos) => set({ loopStart: pos }),
  setLoopEnd: (pos) => set({ loopEnd: pos, loopEnabled: pos !== null }),
  toggleLoop: () => set((state) => ({ loopEnabled: !state.loopEnabled })),
  clearLoop: () => set({ loopEnabled: false, loopStart: null, loopEnd: null }),
}));
