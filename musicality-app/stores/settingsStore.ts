import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DanceStyle } from '../utils/beatCounter';
import { CueType } from '../types/cue';
import { PhraseDetectionMode, EditionId, PhraseEdition, TrackEditions } from '../types/analysis';

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

  // ─── Phrase Edition System ───────────────────────────
  trackEditions: Record<string, TrackEditions>;

  /** Store server analysis as 'S' edition */
  setServerEdition: (trackId: string, boundaryBeatIndices: number[]) => void;

  /** Create or update a user edition's boundaries, set as active */
  setEditionBoundaries: (trackId: string, editionId: EditionId, boundaries: number[]) => void;

  /** Switch active edition */
  setActiveEdition: (trackId: string, editionId: EditionId) => void;

  /** Delete a user edition (S cannot be deleted) */
  deleteUserEdition: (trackId: string, editionId: EditionId) => void;

  // ─── Draft System (unsaved edits) ─────────────────────
  /** Temporary boundaries while user is experimenting — not persisted */
  draftBoundaries: Record<string, number[]>;

  /** Update draft boundaries (live preview, not saved to edition yet) */
  setDraftBoundaries: (trackId: string, boundaries: number[]) => void;

  /** Discard draft — revert to active edition */
  clearDraft: (trackId: string) => void;

  /** Save current draft as a new user edition, auto-allocate slot */
  saveDraftAsEdition: (trackId: string) => EditionId | null;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
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

      // ─── Phrase Edition System ───────────────────────────

      trackEditions: {},

      setServerEdition: (trackId, boundaryBeatIndices) =>
        set((state) => {
          const existing = state.trackEditions[trackId] ?? {
            server: null, userEditions: [], activeEditionId: 'S' as EditionId,
          };
          const now = Date.now();
          return {
            trackEditions: {
              ...state.trackEditions,
              [trackId]: {
                ...existing,
                server: {
                  id: 'S' as EditionId,
                  boundaries: boundaryBeatIndices,
                  createdAt: existing.server?.createdAt ?? now,
                  updatedAt: now,
                },
                // Keep current active unless nothing was active
                activeEditionId: existing.activeEditionId || 'S',
              },
            },
          };
        }),

      setEditionBoundaries: (trackId, editionId, boundaries) =>
        set((state) => {
          if (editionId === 'S') return state; // server edition is read-only

          const existing = state.trackEditions[trackId] ?? {
            server: null, userEditions: [], activeEditionId: 'S' as EditionId,
          };
          const now = Date.now();
          const idx = existing.userEditions.findIndex(e => e.id === editionId);
          let newUserEditions: PhraseEdition[];

          if (idx >= 0) {
            // Update in-place
            newUserEditions = existing.userEditions.map((e, i) =>
              i === idx ? { ...e, boundaries, updatedAt: now } : e
            );
          } else {
            // Create new edition
            newUserEditions = [
              ...existing.userEditions,
              { id: editionId, boundaries, createdAt: now, updatedAt: now },
            ];
          }

          return {
            trackEditions: {
              ...state.trackEditions,
              [trackId]: {
                ...existing,
                userEditions: newUserEditions,
                activeEditionId: editionId,
              },
            },
          };
        }),

      setActiveEdition: (trackId, editionId) =>
        set((state) => {
          const editions = state.trackEditions[trackId];
          if (!editions) return state;

          // Validate edition exists
          if (editionId === 'S' && !editions.server) return state;
          if (editionId !== 'S' && !editions.userEditions.find(e => e.id === editionId)) return state;

          return {
            trackEditions: {
              ...state.trackEditions,
              [trackId]: { ...editions, activeEditionId: editionId },
            },
          };
        }),

      deleteUserEdition: (trackId, editionId) =>
        set((state) => {
          if (editionId === 'S') return state; // cannot delete server edition
          const editions = state.trackEditions[trackId];
          if (!editions) return state;

          const newUserEditions = editions.userEditions.filter(e => e.id !== editionId);
          const newActive = editions.activeEditionId === editionId ? 'S' as EditionId : editions.activeEditionId;

          return {
            trackEditions: {
              ...state.trackEditions,
              [trackId]: {
                ...editions,
                userEditions: newUserEditions,
                activeEditionId: newActive,
              },
            },
          };
        }),

      // ─── Draft System ───────────────────────────────────

      draftBoundaries: {},

      setDraftBoundaries: (trackId, boundaries) =>
        set((state) => ({
          draftBoundaries: { ...state.draftBoundaries, [trackId]: boundaries },
        })),

      clearDraft: (trackId) =>
        set((state) => {
          const { [trackId]: _, ...rest } = state.draftBoundaries;
          return { draftBoundaries: rest };
        }),

      saveDraftAsEdition: (trackId) => {
        const state = get();
        const draft = state.draftBoundaries[trackId];
        if (!draft || draft.length === 0) return null;

        const editions = state.trackEditions[trackId] ?? {
          server: null, userEditions: [], activeEditionId: 'S' as EditionId,
        };

        // Find available slot
        const usedIds = new Set(editions.userEditions.map(e => e.id));
        let slotId: EditionId;
        const available = (['1', '2', '3'] as EditionId[]).filter(id => !usedIds.has(id));

        if (available.length > 0) {
          slotId = available[0];
        } else {
          // All 3 slots used — evict oldest by createdAt
          const sorted = [...editions.userEditions].sort((a, b) => a.createdAt - b.createdAt);
          slotId = sorted[0].id;
        }

        const now = Date.now();
        const newUserEditions = editions.userEditions
          .filter(e => e.id !== slotId)
          .concat({ id: slotId, boundaries: draft, createdAt: now, updatedAt: now });

        // Clear draft + save edition + set active
        const { [trackId]: _, ...restDrafts } = state.draftBoundaries;
        set({
          draftBoundaries: restDrafts,
          trackEditions: {
            ...state.trackEditions,
            [trackId]: {
              ...editions,
              userEditions: newUserEditions,
              activeEditionId: slotId,
            },
          },
        });

        return slotId;
      },
    }),
    {
      name: 'musicality-settings',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // Migrate phraseBoundaryOverrides → trackEditions
          const overrides = persistedState.phraseBoundaryOverrides ?? {};
          const trackEditions: Record<string, TrackEditions> = {};
          for (const [trackId, boundaries] of Object.entries(overrides)) {
            if (Array.isArray(boundaries) && boundaries.length > 0) {
              trackEditions[trackId] = {
                server: null,
                userEditions: [{
                  id: '1' as EditionId,
                  boundaries: boundaries as number[],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                }],
                activeEditionId: '1' as EditionId,
              };
            }
          }
          const { phraseBoundaryOverrides, boundaryCorrections, ...rest } = persistedState;
          return { ...rest, trackEditions };
        }
        return persistedState as SettingsState;
      },
      partialize: (state) => ({
        danceStyle: state.danceStyle,
        lookAheadMs: state.lookAheadMs,
        downbeatOffsets: state.downbeatOffsets,
        cueType: state.cueType,
        cueVolume: state.cueVolume,
        cueEnabled: state.cueEnabled,
        phraseDetectionMode: state.phraseDetectionMode,
        defaultBeatsPerPhrase: state.defaultBeatsPerPhrase,
        phraseMarks: state.phraseMarks,
        trackEditions: state.trackEditions,
      }),
    },
  ),
);
