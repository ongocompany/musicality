/**
 * IndexedDB file storage for web player.
 * Stores File blobs so tracks survive browser refresh.
 * Uses idb-keyval for simple key-value access.
 *
 * Key pattern: `file_{trackId}` → File blob
 * Key pattern: `meta_{trackId}` → serializable track metadata (no blob)
 */

import { get, set, del, keys, clear } from 'idb-keyval';

// ─── File Blob Storage ───────────────────────────────

/**
 * Store a File blob in IndexedDB.
 */
export async function storeFile(trackId: string, file: File): Promise<void> {
  await set(`file_${trackId}`, file);
}

/**
 * Retrieve a File blob from IndexedDB.
 */
export async function getFile(trackId: string): Promise<File | undefined> {
  return get<File>(`file_${trackId}`);
}

/**
 * Delete a File blob from IndexedDB.
 */
export async function deleteFile(trackId: string): Promise<void> {
  await del(`file_${trackId}`);
}

/**
 * Get all stored file track IDs.
 */
export async function getStoredFileIds(): Promise<string[]> {
  const allKeys = await keys();
  return (allKeys as string[])
    .filter((k) => k.startsWith('file_'))
    .map((k) => k.replace('file_', ''));
}

// ─── Track Metadata Storage ──────────────────────────
// Serializable metadata (everything except File blob and blob URL)

export interface StoredTrackMeta {
  id: string;
  title: string;
  mediaType: 'audio' | 'video' | 'youtube';
  duration: number | null;
  fileSize: number | null;
  format: string | null;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  addedAt?: number;
  folderId?: string;
  fingerprint?: string;
  analysisStatus: 'idle' | 'analyzing' | 'done' | 'error';
  // Analysis data (JSON-serializable)
  analysisData?: {
    bpm: number;
    beats: number[];
    downbeats: number[];
    beatsPerBar: number;
    confidence: number;
    sections: Array<{
      label: string;
      startTime: number;
      endTime: number;
      confidence: number;
    }>;
    phraseBoundaries: number[];
    waveformPeaks: number[];
  };
}

/**
 * Store serializable track metadata in IndexedDB.
 */
export async function storeTrackMeta(meta: StoredTrackMeta): Promise<void> {
  await set(`meta_${meta.id}`, meta);
}

/**
 * Retrieve track metadata from IndexedDB.
 */
export async function getTrackMeta(trackId: string): Promise<StoredTrackMeta | undefined> {
  return get<StoredTrackMeta>(`meta_${trackId}`);
}

/**
 * Delete track metadata from IndexedDB.
 */
export async function deleteTrackMeta(trackId: string): Promise<void> {
  await del(`meta_${trackId}`);
}

/**
 * Get all stored track metadata.
 */
export async function getAllTrackMetas(): Promise<StoredTrackMeta[]> {
  const allKeys = await keys();
  const metaKeys = (allKeys as string[]).filter((k) => k.startsWith('meta_'));
  const metas: StoredTrackMeta[] = [];
  for (const key of metaKeys) {
    const meta = await get<StoredTrackMeta>(key);
    if (meta) metas.push(meta);
  }
  return metas;
}

// ─── Folder Storage ──────────────────────────────────

export interface StoredFolder {
  id: string;
  name: string;
  mediaType: 'audio' | 'video' | 'youtube';
  createdAt: number;
}

const FOLDERS_KEY = 'player_folders';

/**
 * Store folders array in IndexedDB.
 */
export async function storeFolders(folders: StoredFolder[]): Promise<void> {
  await set(FOLDERS_KEY, folders);
}

/**
 * Retrieve folders from IndexedDB.
 */
export async function getFolders(): Promise<StoredFolder[]> {
  return (await get<StoredFolder[]>(FOLDERS_KEY)) ?? [];
}

// ─── Sort Preferences ───────────────────────────────

const SORT_KEY = 'player_sort';

interface SortPrefs {
  sortBy: 'addedAt' | 'title' | 'bpm' | 'duration';
  sortOrder: 'asc' | 'desc';
}

export async function storeSortPrefs(prefs: SortPrefs): Promise<void> {
  await set(SORT_KEY, prefs);
}

export async function getSortPrefs(): Promise<SortPrefs | undefined> {
  return get<SortPrefs>(SORT_KEY);
}

// ─── Bulk Operations ─────────────────────────────────

/**
 * Delete all player data from IndexedDB.
 */
export async function clearAllPlayerData(): Promise<void> {
  await clear();
}

/**
 * Delete a track completely (file + metadata).
 */
export async function deleteTrackCompletely(trackId: string): Promise<void> {
  await Promise.all([deleteFile(trackId), deleteTrackMeta(trackId)]);
}
