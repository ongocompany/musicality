import { create } from 'zustand';
import type { PlayerTrack, TrackAnalysis } from '@/lib/types';
import {
  storeFile,
  storeTrackMeta,
  deleteTrackCompletely,
  storeFolders,
  storeSortPrefs,
  getAllTrackMetas,
  getFile,
  getFolders,
  getSortPrefs,
  type StoredTrackMeta,
} from '@/lib/idb-file-store';

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
  fingerprint?: string;     // SHA-256 hash for cross-device matching
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

  // IndexedDB Hydration
  _hydrated: boolean;
  hydrateFromIDB: () => Promise<void>;
}

export const useWebPlayerStore = create<WebPlayerState>()((set, get) => ({
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
      // Clean up IndexedDB (fire-and-forget)
      deleteTrackCompletely(id).catch(() => {});
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

  // ─── IndexedDB Hydration ──────────────────────────────
  _hydrated: false,
  hydrateFromIDB: async () => {
    if (get()._hydrated) return;
    try {
      // Load track metadata + folders + sort prefs in parallel
      const [metas, folders, sortPrefs] = await Promise.all([
        getAllTrackMetas(),
        getFolders(),
        getSortPrefs(),
      ]);

      // Reconstruct LocalTrack[] from stored metadata + file blobs
      const tracks: LocalTrack[] = [];
      for (const meta of metas) {
        // YouTube tracks don't need file blobs
        if (meta.mediaType === 'youtube') {
          tracks.push(metaToLocalTrack(meta, null));
          continue;
        }
        // Try to get file blob from IDB
        const file = await getFile(meta.id);
        if (file) {
          const fileUrl = URL.createObjectURL(file);
          tracks.push(metaToLocalTrack(meta, file, fileUrl));
        }
        // If file blob is missing, skip this track
        // (file was cleared from IDB, user needs to re-add)
      }

      set({
        tracks,
        folders,
        sortBy: sortPrefs?.sortBy ?? 'addedAt',
        sortOrder: sortPrefs?.sortOrder ?? 'desc',
        _hydrated: true,
      });
    } catch (err) {
      console.error('[IDB] Hydration failed:', err);
      set({ _hydrated: true }); // Mark hydrated anyway to avoid retries
    }
  },
}));

// ─── Helpers ────────────────────────────────────────────

function metaToLocalTrack(
  meta: StoredTrackMeta,
  file: File | null,
  fileUrl?: string,
): LocalTrack {
  return {
    id: meta.id,
    title: meta.title,
    mediaType: meta.mediaType,
    fileUrl: fileUrl ?? meta.youtubeUrl ?? '',
    file: file ?? undefined,
    duration: meta.duration,
    fileSize: meta.fileSize,
    format: meta.format,
    youtubeUrl: meta.youtubeUrl,
    youtubeVideoId: meta.youtubeVideoId,
    addedAt: meta.addedAt,
    folderId: meta.folderId,
    fingerprint: meta.fingerprint,
    analysisStatus: meta.analysisData ? 'done' : meta.analysisStatus,
    analysis: meta.analysisData
      ? {
          id: `local_${meta.id}`,
          trackId: meta.id,
          userId: '',
          bpm: meta.analysisData.bpm,
          beats: meta.analysisData.beats,
          downbeats: meta.analysisData.downbeats,
          beatsPerBar: meta.analysisData.beatsPerBar,
          confidence: meta.analysisData.confidence,
          sections: meta.analysisData.sections as TrackAnalysis['sections'],
          phraseBoundaries: meta.analysisData.phraseBoundaries,
          waveformPeaks: meta.analysisData.waveformPeaks,
          fingerprint: meta.fingerprint ?? null,
          createdAt: new Date().toISOString(),
        }
      : undefined,
  };
}

function localTrackToMeta(track: LocalTrack): StoredTrackMeta {
  return {
    id: track.id,
    title: track.title,
    mediaType: track.mediaType,
    duration: track.duration,
    fileSize: track.fileSize,
    format: track.format,
    youtubeUrl: track.youtubeUrl,
    youtubeVideoId: track.youtubeVideoId,
    addedAt: track.addedAt,
    folderId: track.folderId,
    fingerprint: track.fingerprint,
    analysisStatus: track.analysisStatus,
    analysisData: track.analysis
      ? {
          bpm: track.analysis.bpm,
          beats: track.analysis.beats,
          downbeats: track.analysis.downbeats,
          beatsPerBar: track.analysis.beatsPerBar,
          confidence: track.analysis.confidence,
          sections: track.analysis.sections,
          phraseBoundaries: track.analysis.phraseBoundaries,
          waveformPeaks: track.analysis.waveformPeaks,
        }
      : undefined,
  };
}

// ─── Auto-persist subscriber ────────────────────────────
// Subscribe to state changes and persist to IndexedDB.
// Uses debounce to avoid excessive writes (especially for position/duration).

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let prevTrackIds: string = '';
let prevFolders: string = '';
let prevSort: string = '';

useWebPlayerStore.subscribe((state) => {
  // Skip if not hydrated yet (avoid overwriting IDB with empty state)
  if (!state._hydrated) return;

  // Debounce: only persist library changes, not playback state
  const trackIds = state.tracks.map((t) => `${t.id}:${t.analysisStatus}:${t.folderId ?? ''}`).join(',');
  const foldersKey = JSON.stringify(state.folders);
  const sortKey = `${state.sortBy}:${state.sortOrder}`;

  const tracksChanged = trackIds !== prevTrackIds;
  const foldersChanged = foldersKey !== prevFolders;
  const sortChanged = sortKey !== prevSort;

  if (!tracksChanged && !foldersChanged && !sortChanged) return;

  prevTrackIds = trackIds;
  prevFolders = foldersKey;
  prevSort = sortKey;

  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistToIDB(state).catch((err) =>
      console.error('[IDB] Persist failed:', err),
    );
  }, 500);
});

async function persistToIDB(state: WebPlayerState) {
  // Persist tracks (metadata + file blobs)
  const promises: Promise<void>[] = [];

  for (const track of state.tracks) {
    promises.push(storeTrackMeta(localTrackToMeta(track)));
    // Store file blob if it exists and hasn't been stored yet
    if (track.file) {
      promises.push(storeFile(track.id, track.file));
    }
  }

  // Persist folders
  promises.push(storeFolders(state.folders));

  // Persist sort preferences
  promises.push(storeSortPrefs({ sortBy: state.sortBy, sortOrder: state.sortOrder }));

  await Promise.all(promises);
}
