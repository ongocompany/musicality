import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, Folder, SortField, SortOrder, MediaType } from '../types/track';
import { AnalysisResult, AnalysisStatus } from '../types/analysis';

interface PlayerState {
  // Library
  tracks: Track[];
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  renameTrack: (id: string, newTitle: string) => void;
  setTrackThumbnail: (id: string, uri: string) => void;

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

  // Analysis
  setTrackAnalysisStatus: (trackId: string, status: AnalysisStatus) => void;
  setTrackAnalysis: (trackId: string, analysis: AnalysisResult) => void;
  setTrackPendingJobId: (trackId: string, jobId: string | undefined) => void;

  // Sync
  setTrackRemoteId: (trackId: string, remoteId: string) => void;
  updateTrackData: (trackId: string, updates: Partial<Track>) => void;

  // Playback
  currentTrack: Track | null;
  setCurrentTrack: (track: Track) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  position: number; // ms
  setPosition: (pos: number) => void;
  duration: number; // ms
  setDuration: (dur: number) => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;

  // Seeking (drag in progress)
  isSeeking: boolean;
  setIsSeeking: (seeking: boolean) => void;

  // Video aspect ratio (dynamic from naturalSize)
  videoAspectRatio: number;
  setVideoAspectRatio: (ratio: number) => void;

  // Loop (A-B repeat)
  loopEnabled: boolean;
  loopStart: number | null; // ms
  loopEnd: number | null; // ms
  setLoopStart: (pos: number | null) => void;
  setLoopEnd: (pos: number | null) => void;
  toggleLoop: () => void;
  clearLoop: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      // Library
      tracks: [],
      addTrack: (track) => set((state) => {
        // Duplicate: overwrite existing track with same id
        const existing = state.tracks.findIndex((t) => t.id === track.id);
        if (existing >= 0) {
          const updated = [...state.tracks];
          updated[existing] = track;
          return { tracks: updated };
        }
        return { tracks: [...state.tracks, track] };
      }),
      removeTrack: (id) => {
        set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }));
        try {
          const { useSettingsStore } = require('./settingsStore');
          useSettingsStore.getState().removeTrackData(id);
        } catch {}
      },
      renameTrack: (id, newTitle) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === id ? { ...t, title: newTitle } : t,
          ),
          currentTrack:
            state.currentTrack?.id === id
              ? { ...state.currentTrack, title: newTitle }
              : state.currentTrack,
        })),
      setTrackThumbnail: (id, uri) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === id ? { ...t, thumbnailUri: uri } : t,
          ),
          currentTrack:
            state.currentTrack?.id === id
              ? { ...state.currentTrack, thumbnailUri: uri }
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
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, name } : f,
          ),
        })),
      deleteFolder: (id) =>
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          // Move tracks in deleted folder to root
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
      sortBy: 'importedAt',
      sortOrder: 'desc',
      setSortBy: (field) => set({ sortBy: field }),
      setSortOrder: (order) => set({ sortOrder: order }),

      // Analysis
      setTrackAnalysisStatus: (trackId, status) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, analysisStatus: status } : t,
          ),
          currentTrack:
            state.currentTrack?.id === trackId
              ? { ...state.currentTrack, analysisStatus: status }
              : state.currentTrack,
        })),
      setTrackAnalysis: (trackId, analysis) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, analysis, analysisStatus: 'done' as AnalysisStatus, pendingJobId: undefined } : t,
          ),
          currentTrack:
            state.currentTrack?.id === trackId
              ? { ...state.currentTrack, analysis, analysisStatus: 'done' as AnalysisStatus, pendingJobId: undefined }
              : state.currentTrack,
        })),
      setTrackPendingJobId: (trackId, jobId) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, pendingJobId: jobId } : t,
          ),
          currentTrack:
            state.currentTrack?.id === trackId
              ? { ...state.currentTrack, pendingJobId: jobId }
              : state.currentTrack,
        })),

      // Sync
      setTrackRemoteId: (trackId, remoteId) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, remoteId } : t,
          ),
          currentTrack:
            state.currentTrack?.id === trackId
              ? { ...state.currentTrack, remoteId }
              : state.currentTrack,
        })),
      updateTrackData: (trackId, updates) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, ...updates } : t,
          ),
          currentTrack:
            state.currentTrack?.id === trackId
              ? { ...state.currentTrack, ...updates }
              : state.currentTrack,
        })),

      // Playback
      currentTrack: null,
      setCurrentTrack: (track) => set({ currentTrack: track, position: 0, isPlaying: false, loopEnabled: false, loopStart: null, loopEnd: null, videoAspectRatio: 16 / 9 }),
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

      // Video aspect ratio
      videoAspectRatio: 16 / 9,
      setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),

      // Loop
      loopEnabled: false,
      loopStart: null,
      loopEnd: null,
      setLoopStart: (pos) => set({ loopStart: pos }),
      setLoopEnd: (pos) => set({ loopEnd: pos, loopEnabled: pos !== null }),
      toggleLoop: () => set((state) => ({ loopEnabled: !state.loopEnabled })),
      clearLoop: () => set({ loopEnabled: false, loopStart: null, loopEnd: null }),
    }),
    {
      name: 'musicality-tracks',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tracks: state.tracks,
        folders: state.folders,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      }),
      migrate: (persistedState: any, version: number) => {
        let state = persistedState;
        if (version < 2) {
          // v1 → v2: add folders, sortBy, sortOrder defaults
          state = {
            ...state,
            folders: state.folders ?? [],
            sortBy: state.sortBy ?? 'importedAt',
            sortOrder: state.sortOrder ?? 'desc',
          };
        }
        if (version < 3) {
          // v2 → v3: add mediaType to folders (default 'audio')
          state = {
            ...state,
            folders: (state.folders ?? []).map((f: any) => ({
              ...f,
              mediaType: f.mediaType ?? 'audio',
            })),
          };
        }
        return state as PlayerState;
      },
      // Reset stuck 'analyzing' status on rehydration
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        let changed = false;
        const fixed = state.tracks.map((t) => {
          if (t.analysisStatus === 'analyzing' && !t.pendingJobId) {
            changed = true;
            return { ...t, analysisStatus: 'idle' as AnalysisStatus };
          }
          return t;
        });
        if (changed) {
          usePlayerStore.setState({ tracks: fixed });
        }
      },
    },
  ),
);
