import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../types/track';
import { AnalysisResult, AnalysisStatus } from '../types/analysis';

interface PlayerState {
  // Library
  tracks: Track[];
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  renameTrack: (id: string, newTitle: string) => void;
  setTrackThumbnail: (id: string, uri: string) => void;

  // Analysis
  setTrackAnalysisStatus: (trackId: string, status: AnalysisStatus) => void;
  setTrackAnalysis: (trackId: string, analysis: AnalysisResult) => void;

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
      addTrack: (track) => set((state) => ({ tracks: [...state.tracks, track] })),
      removeTrack: (id) => set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) })),
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
            t.id === trackId ? { ...t, analysis, analysisStatus: 'done' as AnalysisStatus } : t,
          ),
          currentTrack:
            state.currentTrack?.id === trackId
              ? { ...state.currentTrack, analysis, analysisStatus: 'done' as AnalysisStatus }
              : state.currentTrack,
        })),

      // Playback
      currentTrack: null,
      setCurrentTrack: (track) => set({ currentTrack: track, position: 0, loopEnabled: false, loopStart: null, loopEnd: null }),
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
    }),
    {
      name: 'musicality-tracks',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the tracks array (playback state is transient)
      partialize: (state) => ({ tracks: state.tracks }),
      // Reset stuck 'analyzing' status on rehydration
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        let changed = false;
        const fixed = state.tracks.map((t) => {
          if (t.analysisStatus === 'analyzing') {
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
