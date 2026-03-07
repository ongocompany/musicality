import { create } from 'zustand';
import { DanceStyle } from '../utils/beatCounter';

interface SettingsState {
  // Dance style (global setting)
  danceStyle: DanceStyle;
  setDanceStyle: (style: DanceStyle) => void;

  // Per-track downbeat offset corrections
  // Key: track.id, Value: beat index in beats[] that user marked as "1"
  downbeatOffsets: Record<string, number>;
  setDownbeatOffset: (trackId: string, beatIndex: number) => void;
  clearDownbeatOffset: (trackId: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  danceStyle: 'bachata',
  setDanceStyle: (style) => set({ danceStyle: style }),

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
}));
