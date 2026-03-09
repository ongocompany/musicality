import { create } from 'zustand';
import { DanceStyle } from '../utils/beatCounter';
import { CueType } from '../types/cue';
import { PhraseDetectionMode } from '../types/analysis';

interface SettingsState {
  // Dance style (global setting)
  danceStyle: DanceStyle;
  setDanceStyle: (style: DanceStyle) => void;

  // Look-ahead offset to compensate audio output latency (ms)
  lookAheadMs: number;
  setLookAheadMs: (ms: number) => void;

  // Per-track downbeat offset corrections
  // Key: track.id, Value: beat index in beats[] that user marked as "1"
  downbeatOffsets: Record<string, number>;
  setDownbeatOffset: (trackId: string, beatIndex: number) => void;
  clearDownbeatOffset: (trackId: string) => void;

  // Cue sound settings
  cueType: CueType;
  setCueType: (type: CueType) => void;
  cueVolume: number;       // 0.0 ~ 1.0
  setCueVolume: (vol: number) => void;
  cueEnabled: boolean;
  toggleCue: () => void;

  // Phrase detection settings
  phraseDetectionMode: PhraseDetectionMode;
  setPhraseDetectionMode: (mode: PhraseDetectionMode) => void;
  defaultBeatsPerPhrase: number;  // default 32 (4 eight-counts)
  setDefaultBeatsPerPhrase: (n: number) => void;
  // Per-track phrase boundary marks (for 'user-marked' mode)
  phraseMarks: Record<string, number>;
  setPhraseMark: (trackId: string, beatIndex: number) => void;
  clearPhraseMark: (trackId: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  danceStyle: 'bachata',
  setDanceStyle: (style) => set({ danceStyle: style }),

  lookAheadMs: 150,
  setLookAheadMs: (ms) => set({ lookAheadMs: Math.max(0, Math.min(300, ms)) }),

  downbeatOffsets: {},
  setDownbeatOffset: (trackId, beatIndex) =>
    set((state) => ({
      downbeatOffsets: { ...state.downbeatOffsets, [trackId]: beatIndex },
    })),
  clearDownbeatOffset: (trackId) =>
    set((state) => {
      const { [trackId]: _, ...rest } = state.downbeatOffsets;
      return { downbeatOffsets: rest };
    }),

  cueType: 'off',
  setCueType: (type) => set({ cueType: type, cueEnabled: type !== 'off' }),
  cueVolume: 0.7,
  setCueVolume: (vol) => set({ cueVolume: Math.max(0, Math.min(1, vol)) }),
  cueEnabled: false,
  toggleCue: () => set((state) => ({ cueEnabled: !state.cueEnabled })),

  // Phrase detection
  phraseDetectionMode: 'server',
  setPhraseDetectionMode: (mode) => set({ phraseDetectionMode: mode }),
  defaultBeatsPerPhrase: 32,
  setDefaultBeatsPerPhrase: (n) => set({ defaultBeatsPerPhrase: Math.max(8, Math.round(n / 8) * 8) }),
  phraseMarks: {},
  setPhraseMark: (trackId, beatIndex) =>
    set((state) => ({
      phraseMarks: { ...state.phraseMarks, [trackId]: beatIndex },
    })),
  clearPhraseMark: (trackId) =>
    set((state) => {
      const { [trackId]: _, ...rest } = state.phraseMarks;
      return { phraseMarks: rest };
    }),
}));
