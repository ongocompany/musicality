import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DanceStyle } from '../utils/beatCounter';
import { CueType } from '../types/cue';
import { PhraseDetectionMode, EditionId, PhraseEdition, TrackEditions } from '../types/analysis';
import { ImportedPhraseNote } from '../types/phraseNote';
import { FormationData, FormationEditionId, FormationEdition, TrackFormations, StageConfig, DEFAULT_STAGE_CONFIG } from '../types/formation';

interface SettingsState {
  // Language (i18n)
  language: string;
  setLanguage: (lang: string) => void;

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

  // Per-track beat timing offset (ms) — applied immediately, not part of edition
  beatTimeOffsets: Record<string, number>;
  setBeatTimeOffset: (trackId: string, offsetMs: number) => void;

  // Per-track BPM override (display + synthetic regen)
  bpmOverrides: Record<string, number>;
  setBpmOverride: (trackId: string, bpm: number) => void;
  clearBpmOverride: (trackId: string) => void;

  // Grid display mode: page (classic) vs scroll (rhythm-game style)
  gridScrollMode: boolean;
  toggleGridScrollMode: () => void;

  // Analysis engine: undefined = default (Madmom), 'bt' = Beat This!
  analysisEngine: string | undefined;
  setAnalysisEngine: (engine: string | undefined) => void;

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

  // ─── Cell Notes (per-beat memos, max 30 chars) ──────
  cellNotes: Record<string, Record<string, string>>;  // trackId → { beatIndex → note }
  setCellNote: (trackId: string, beatIndex: number, note: string) => void;
  clearCellNote: (trackId: string, beatIndex: number) => void;

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

  // ─── Imported PhraseNotes (unlimited, separate from editions) ───
  importedNotes: ImportedPhraseNote[];
  addImportedNote: (note: ImportedPhraseNote) => void;
  removeImportedNote: (id: string) => void;
  setActiveImportedNote: (trackId: string, noteId: string | null) => void;

  // ─── Formation System ─────────────────────────────
  trackFormations: Record<string, TrackFormations>;

  /** Store server-suggested formation as 'S' edition */
  setServerFormation: (trackId: string, data: FormationData) => void;

  /** Create or update a user formation edition, set as active */
  setFormationEdition: (trackId: string, editionId: FormationEditionId, data: FormationData) => void;

  /** Switch active formation edition */
  setActiveFormationEdition: (trackId: string, editionId: FormationEditionId) => void;

  /** Delete a user formation edition (S cannot be deleted) */
  deleteFormationEdition: (trackId: string, editionId: FormationEditionId) => void;

  // Draft formation (for live editing before saving)
  draftFormation: Record<string, FormationData>;
  setDraftFormation: (trackId: string, data: FormationData) => void;
  clearFormationDraft: (trackId: string) => void;
  saveFormationDraftAsEdition: (trackId: string) => FormationEditionId | null;

  // Stage configuration (grid size in meters)
  stageConfig: StageConfig;
  setStageConfig: (config: Partial<StageConfig>) => void;

  // Show album art next to beat count
  showAlbumArt: boolean;
  setShowAlbumArt: (show: boolean) => void;

  // Auto-hide controls delay (ms), 0 = disabled
  autoHideMs: number;
  setAutoHideMs: (ms: number) => void;

  // Cloud Library sync
  cloudSyncEnabled: boolean;
  setCloudSyncEnabled: (enabled: boolean) => void;
  cloudSyncWifiOnly: boolean;
  setCloudSyncWifiOnly: (wifiOnly: boolean) => void;

  // Onboarding tutorial
  hasSeenOnboarding: boolean;
  setHasSeenOnboarding: (seen: boolean) => void;

  // Cleanup orphaned track data (trackIds that no longer exist in player)
  cleanupTrackData: (validTrackIds: Set<string>) => void;
  removeTrackData: (trackId: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      language: '',  // empty = not yet chosen, will detect on first launch
      setLanguage: (lang) => {
        set({ language: lang });
        // Sync i18next language
        try {
          const i18next = require('../i18n').default;
          i18next.changeLanguage(lang);
        } catch {}
      },

      danceStyle: 'bachata',
      setDanceStyle: (style) => set({ danceStyle: style }),

      lookAheadMs: 150,
      setLookAheadMs: (ms) => set({ lookAheadMs: Math.max(-300, Math.min(300, ms)) }),

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

      beatTimeOffsets: {},
      setBeatTimeOffset: (trackId, offsetMs) =>
        set((state) => ({
          beatTimeOffsets: { ...state.beatTimeOffsets, [trackId]: offsetMs },
        })),

      bpmOverrides: {},
      setBpmOverride: (trackId, bpm) =>
        set((state) => ({
          bpmOverrides: { ...state.bpmOverrides, [trackId]: Math.max(1, Math.round(bpm * 10) / 10) },
        })),
      clearBpmOverride: (trackId) =>
        set((state) => {
          const { [trackId]: _, ...rest } = state.bpmOverrides;
          return { bpmOverrides: rest };
        }),

      gridScrollMode: false,
      toggleGridScrollMode: () => set((state) => ({ gridScrollMode: !state.gridScrollMode })),

      analysisEngine: undefined,
      setAnalysisEngine: (engine) => set({ analysisEngine: engine }),

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

      // ─── Cell Notes ─────────────────────────────────────

      cellNotes: {},
      setCellNote: (trackId, beatIndex, note) =>
        set((state) => {
          const trackNotes = { ...(state.cellNotes[trackId] || {}) };
          const trimmed = note.trim().slice(0, 30);
          if (trimmed) {
            trackNotes[String(beatIndex)] = trimmed;
          } else {
            delete trackNotes[String(beatIndex)];
          }
          return { cellNotes: { ...state.cellNotes, [trackId]: trackNotes } };
        }),
      clearCellNote: (trackId, beatIndex) =>
        set((state) => {
          const trackNotes = { ...(state.cellNotes[trackId] || {}) };
          delete trackNotes[String(beatIndex)];
          return { cellNotes: { ...state.cellNotes, [trackId]: trackNotes } };
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

      // ─── Imported PhraseNotes ──────────────────────────

      importedNotes: [],

      addImportedNote: (note) =>
        set((state) => ({
          importedNotes: [...state.importedNotes, note],
        })),

      removeImportedNote: (id) =>
        set((state) => ({
          importedNotes: state.importedNotes.filter(n => n.id !== id),
        })),

      setActiveImportedNote: (trackId, noteId) =>
        set((state) => ({
          importedNotes: state.importedNotes.map(n => {
            if (n.trackId !== trackId) return n;
            return { ...n, isActive: n.id === noteId };
          }),
        })),

      // ─── Formation System ───────────────────────────

      trackFormations: {},

      setServerFormation: (trackId, data) =>
        set((state) => {
          const existing = state.trackFormations[trackId] ?? {
            server: null, userEditions: [], activeEditionId: 'S' as FormationEditionId,
          };
          const now = Date.now();
          return {
            trackFormations: {
              ...state.trackFormations,
              [trackId]: {
                ...existing,
                server: {
                  id: 'S' as FormationEditionId,
                  data,
                  createdAt: existing.server?.createdAt ?? now,
                  updatedAt: now,
                },
                activeEditionId: existing.activeEditionId || 'S',
              },
            },
          };
        }),

      setFormationEdition: (trackId, editionId, data) =>
        set((state) => {
          if (editionId === 'S') return state;

          const existing = state.trackFormations[trackId] ?? {
            server: null, userEditions: [], activeEditionId: 'S' as FormationEditionId,
          };
          const now = Date.now();
          const idx = existing.userEditions.findIndex(e => e.id === editionId);
          let newUserEditions: FormationEdition[];

          if (idx >= 0) {
            newUserEditions = existing.userEditions.map((e, i) =>
              i === idx ? { ...e, data, updatedAt: now } : e
            );
          } else {
            newUserEditions = [
              ...existing.userEditions,
              { id: editionId, data, createdAt: now, updatedAt: now },
            ];
          }

          return {
            trackFormations: {
              ...state.trackFormations,
              [trackId]: {
                ...existing,
                userEditions: newUserEditions,
                activeEditionId: editionId,
              },
            },
          };
        }),

      setActiveFormationEdition: (trackId, editionId) =>
        set((state) => {
          const formations = state.trackFormations[trackId];
          if (!formations) return state;

          if (editionId === 'S' && !formations.server) return state;
          if (editionId !== 'S' && !formations.userEditions.find(e => e.id === editionId)) return state;

          return {
            trackFormations: {
              ...state.trackFormations,
              [trackId]: { ...formations, activeEditionId: editionId },
            },
          };
        }),

      deleteFormationEdition: (trackId, editionId) =>
        set((state) => {
          if (editionId === 'S') return state;
          const formations = state.trackFormations[trackId];
          if (!formations) return state;

          const newUserEditions = formations.userEditions.filter(e => e.id !== editionId);
          const newActive = formations.activeEditionId === editionId
            ? 'S' as FormationEditionId : formations.activeEditionId;

          return {
            trackFormations: {
              ...state.trackFormations,
              [trackId]: {
                ...formations,
                userEditions: newUserEditions,
                activeEditionId: newActive,
              },
            },
          };
        }),

      // ─── Formation Draft System ────────────────────

      draftFormation: {},

      setDraftFormation: (trackId, data) =>
        set((state) => ({
          draftFormation: { ...state.draftFormation, [trackId]: data },
        })),

      clearFormationDraft: (trackId) =>
        set((state) => {
          const { [trackId]: _, ...rest } = state.draftFormation;
          return { draftFormation: rest };
        }),

      saveFormationDraftAsEdition: (trackId) => {
        const state = get();
        const draft = state.draftFormation[trackId];
        if (!draft) return null;

        const formations = state.trackFormations[trackId] ?? {
          server: null, userEditions: [], activeEditionId: 'S' as FormationEditionId,
        };

        const usedIds = new Set(formations.userEditions.map(e => e.id));
        let slotId: FormationEditionId;
        const available = (['1', '2', '3'] as FormationEditionId[]).filter(id => !usedIds.has(id));

        if (available.length > 0) {
          slotId = available[0];
        } else {
          const sorted = [...formations.userEditions].sort((a, b) => a.createdAt - b.createdAt);
          slotId = sorted[0].id;
        }

        const now = Date.now();
        const newUserEditions = formations.userEditions
          .filter(e => e.id !== slotId)
          .concat({ id: slotId, data: draft, createdAt: now, updatedAt: now });

        const { [trackId]: _, ...restDrafts } = state.draftFormation;
        set({
          draftFormation: restDrafts,
          trackFormations: {
            ...state.trackFormations,
            [trackId]: {
              ...formations,
              userEditions: newUserEditions,
              activeEditionId: slotId,
            },
          },
        });

        return slotId;
      },

      // ─── Stage Config ──────────────────────────────────
      stageConfig: DEFAULT_STAGE_CONFIG,
      setStageConfig: (config) =>
        set((state) => ({
          stageConfig: { ...state.stageConfig, ...config },
        })),

      // ─── Auto-hide controls ────────────────────────────
      showAlbumArt: true,
      setShowAlbumArt: (show) => set({ showAlbumArt: show }),

      autoHideMs: 3000,
      setAutoHideMs: (ms) => set({ autoHideMs: Math.max(0, ms) }),

      // ─── Cloud Library ─────────────────────────────────
      cloudSyncEnabled: true,  // 베타: 기본 활성화
      setCloudSyncEnabled: (enabled) => set({ cloudSyncEnabled: enabled }),
      cloudSyncWifiOnly: true,  // 기본: Wi-Fi만
      setCloudSyncWifiOnly: (wifiOnly) => set({ cloudSyncWifiOnly: wifiOnly }),

      // ─── Onboarding ──────────────────────────────────
      hasSeenOnboarding: false,
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),

      // ─── Track data cleanup ─────────────────────────
      removeTrackData: (trackId) =>
        set((state) => {
          const { [trackId]: _do, ...downbeatRest } = state.downbeatOffsets;
          const { [trackId]: _bt, ...beatTimeRest } = state.beatTimeOffsets;
          const { [trackId]: _bp, ...bpmRest } = state.bpmOverrides;
          const { [trackId]: _pm, ...phraseRest } = state.phraseMarks;
          const { [trackId]: _cn, ...cellNotesRest } = state.cellNotes;
          const { [trackId]: _te, ...editionsRest } = state.trackEditions;
          const { [trackId]: _db, ...draftRest } = state.draftBoundaries;
          const { [trackId]: _tf, ...formationsRest } = state.trackFormations;
          const { [trackId]: _df, ...draftFormRest } = state.draftFormation;
          return {
            downbeatOffsets: downbeatRest,
            beatTimeOffsets: beatTimeRest,
            bpmOverrides: bpmRest,
            phraseMarks: phraseRest,
            cellNotes: cellNotesRest,
            trackEditions: editionsRest,
            draftBoundaries: draftRest,
            trackFormations: formationsRest,
            draftFormation: draftFormRest,
            importedNotes: state.importedNotes.filter(n => n.trackId !== trackId),
          };
        }),

      cleanupTrackData: (validTrackIds) =>
        set((state) => {
          const filter = <T>(record: Record<string, T>): Record<string, T> => {
            const result: Record<string, T> = {};
            for (const key of Object.keys(record)) {
              if (validTrackIds.has(key)) result[key] = record[key];
            }
            return result;
          };
          const cleaned = {
            downbeatOffsets: filter(state.downbeatOffsets),
            beatTimeOffsets: filter(state.beatTimeOffsets),
            bpmOverrides: filter(state.bpmOverrides),
            phraseMarks: filter(state.phraseMarks),
            cellNotes: filter(state.cellNotes),
            trackEditions: filter(state.trackEditions),
            draftBoundaries: filter(state.draftBoundaries),
            trackFormations: filter(state.trackFormations),
            draftFormation: filter(state.draftFormation),
            importedNotes: state.importedNotes.filter(n => validTrackIds.has(n.trackId)),
          };
          const orphanCount =
            Object.keys(state.downbeatOffsets).length - Object.keys(cleaned.downbeatOffsets).length +
            Object.keys(state.cellNotes).length - Object.keys(cleaned.cellNotes).length +
            Object.keys(state.trackEditions).length - Object.keys(cleaned.trackEditions).length +
            Object.keys(state.trackFormations).length - Object.keys(cleaned.trackFormations).length;
          if (orphanCount > 0) {
            console.log(`[Settings] Cleaned up ${orphanCount} orphaned track data entries`);
          }
          return cleaned;
        }),

      // Reset user-specific data (logout/account switch)
      // Keeps: language, danceStyle, UI prefs
      // Clears: all track-specific data
      resetUserData: () => set({
        downbeatOffsets: {},
        beatTimeOffsets: {},
        bpmOverrides: {},
        trackEditions: {},
        cellNotes: {},
        importedNotes: [],
        trackFormations: {},
        phraseMarks: {},
      }),
    }),
    {
      name: 'musicality-settings',
      version: 6,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState: any, version: number) => {
        let state = { ...persistedState };
        if (version < 2) {
          // Migrate phraseBoundaryOverrides → trackEditions
          const overrides = state.phraseBoundaryOverrides ?? {};
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
          const { phraseBoundaryOverrides, boundaryCorrections, ...rest } = state;
          state = { ...rest, trackEditions };
        }
        if (version < 3) {
          // Add importedNotes array
          state.importedNotes = state.importedNotes ?? [];
        }
        if (version < 4) {
          // Add trackFormations
          state.trackFormations = state.trackFormations ?? {};
        }
        if (version < 5) {
          // Add language preference
          state.language = state.language ?? '';
        }
        if (version < 6) {
          state.beatTimeOffsets = state.beatTimeOffsets ?? {};
          state.bpmOverrides = state.bpmOverrides ?? {};
        }
        // stageConfig — no version bump needed, default applied by store init
        if (!state.stageConfig) {
          state.stageConfig = { gridWidth: 8, gridHeight: 4 };
        }
        return state as SettingsState;
      },
      partialize: (state) => ({
        language: state.language,
        danceStyle: state.danceStyle,
        gridScrollMode: state.gridScrollMode,
        lookAheadMs: state.lookAheadMs,
        downbeatOffsets: state.downbeatOffsets,
        beatTimeOffsets: state.beatTimeOffsets,
        bpmOverrides: state.bpmOverrides,
        cueType: state.cueType,
        cueVolume: state.cueVolume,
        cueEnabled: state.cueEnabled,
        phraseDetectionMode: state.phraseDetectionMode,
        defaultBeatsPerPhrase: state.defaultBeatsPerPhrase,
        phraseMarks: state.phraseMarks,
        trackEditions: state.trackEditions,
        cellNotes: state.cellNotes,
        importedNotes: state.importedNotes,
        trackFormations: state.trackFormations,
        stageConfig: state.stageConfig,
        showAlbumArt: state.showAlbumArt,
        autoHideMs: state.autoHideMs,
        cloudSyncEnabled: state.cloudSyncEnabled,
        cloudSyncWifiOnly: state.cloudSyncWifiOnly,
      }),
    },
  ),
);
