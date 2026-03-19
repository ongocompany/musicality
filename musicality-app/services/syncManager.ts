/**
 * syncManager.ts — Automatic cloud sync manager
 *
 * Cloud drive-style sync:
 * - Auto pull on login / app foreground
 * - Debounced push (5-10s after local change)
 * - Latest updated_at wins on conflict
 * - Fingerprint-based track matching
 * - Guest mode: no sync
 * - Files stay local, only metadata syncs
 */

import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { Track } from '../types/track';
import { AnalysisResult } from '../types/analysis';
import { EditionId } from '../types/analysis';
import { FormationEditionId, FormationData } from '../types/formation';
import { computeQuickHash } from '../utils/fileHash';

// ─── Config ──────────────────────────────────────────

const DEBOUNCE_MS = 7000; // 7 second debounce for push
const SYNC_LOG = '[Sync]';

// ─── State ───────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;
let isPulling = false; // suppress dirty tracking during pull
let isInitialPushDone = false;
let appStateSubscription: any = null;
let playerUnsubscribe: (() => void) | null = null;
let settingsUnsubscribe: (() => void) | null = null;

// Dirty tracking: only push changed items
const dirtyTrackIds = new Set<string>();
const dirtyEditionTrackIds = new Set<string>();

// ─── Initialize sync (call after login) ─────────────

export function startSyncManager(): void {
  const { user, guestMode } = useAuthStore.getState();
  if (!user || guestMode) {
    console.log(SYNC_LOG, 'Skipped: guest mode or not logged in');
    return;
  }

  console.log(SYNC_LOG, 'Starting sync manager');

  // Initial pull, then push all local data (with delay to let store settle)
  pullFromCloud().then(() => {
    setTimeout(() => {
      dirtyTrackIds.clear();
      dirtyEditionTrackIds.clear();
      pushToCloud();
    }, 500);
  });

  // Watch app foreground
  appStateSubscription = AppState.addEventListener('change', handleAppState);

  // Watch local store changes (debounced push with dirty tracking)
  // Only react when tracks[] reference changes, skip position/playback updates
  let prevTracksRef = usePlayerStore.getState().tracks;
  playerUnsubscribe = usePlayerStore.subscribe((state) => {
    if (isPulling) return;
    // Quick bail: if tracks reference hasn't changed, skip entirely
    if (state.tracks === prevTracksRef) return;
    const prev = new Map(prevTracksRef.map(t => [t.id, t]));
    for (const t of state.tracks) {
      const old = prev.get(t.id);
      if (!old || old !== t) dirtyTrackIds.add(t.id);
    }
    prevTracksRef = state.tracks;
    if (dirtyTrackIds.size > 0) schedulePush();
  });

  let prevEditionsRef = useSettingsStore.getState().trackEditions;
  let prevFormationsRef = useSettingsStore.getState().trackFormations;
  let prevNotesRef = useSettingsStore.getState().cellNotes;
  settingsUnsubscribe = useSettingsStore.subscribe((state) => {
    if (isPulling) return; // don't dirty-mark during pull
    let changed = false;
    if (state.trackEditions !== prevEditionsRef) {
      for (const id of Object.keys(state.trackEditions)) {
        if (state.trackEditions[id] !== prevEditionsRef[id]) {
          dirtyEditionTrackIds.add(id);
          changed = true;
        }
      }
      prevEditionsRef = state.trackEditions;
    }
    if (state.trackFormations !== prevFormationsRef) {
      for (const id of Object.keys(state.trackFormations)) {
        if (state.trackFormations[id] !== prevFormationsRef[id]) {
          dirtyEditionTrackIds.add(id);
          changed = true;
        }
      }
      prevFormationsRef = state.trackFormations;
    }
    if (state.cellNotes !== prevNotesRef) {
      for (const id of Object.keys(state.cellNotes)) {
        if (state.cellNotes[id] !== prevNotesRef[id]) {
          dirtyEditionTrackIds.add(id);
          changed = true;
        }
      }
      prevNotesRef = state.cellNotes;
    }
    if (changed) schedulePush();
  });
}

export function stopSyncManager(): void {
  console.log(SYNC_LOG, 'Stopping sync manager');
  appStateSubscription?.remove();
  playerUnsubscribe?.();
  settingsUnsubscribe?.();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  appStateSubscription = null;
  playerUnsubscribe = null;
  settingsUnsubscribe = null;
  isInitialPushDone = false;
  dirtyTrackIds.clear();
  dirtyEditionTrackIds.clear();
}

// ─── App state handler ───────────────────────────────

function handleAppState(state: AppStateStatus): void {
  if (state === 'active') {
    pullFromCloud();
  } else if (state === 'background') {
    // Push immediately when going to background
    pushToCloud();
  }
}

// ─── Debounced push ──────────────────────────────────

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushToCloud(), DEBOUNCE_MS);
}

// ─── Pull from cloud → merge into local ─────────────

export async function pullFromCloud(): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!user || isSyncing) return;

  isSyncing = true;
  isPulling = true; // suppress dirty tracking during pull
  try {
    console.log(SYNC_LOG, 'Pulling from cloud...');

    // 1. Pull tracks + analyses
    const { data: remoteTracks, error } = await supabase
      .from('player_tracks')
      .select('*, track_analyses(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(SYNC_LOG, 'Pull tracks failed:', error.message);
      return;
    }

    if (remoteTracks && remoteTracks.length > 0) {
      await mergeTracksFromCloud(remoteTracks);
    }

    // 2. Pull editions
    const { data: remoteEditions, error: edError } = await supabase
      .from('user_editions')
      .select('*')
      .eq('user_id', user.id);

    if (!edError && remoteEditions && remoteEditions.length > 0) {
      mergeEditionsFromCloud(remoteEditions);
    }

    console.log(SYNC_LOG, `Pulled: ${remoteTracks?.length ?? 0} tracks, ${remoteEditions?.length ?? 0} editions`);
  } catch (err: any) {
    console.warn(SYNC_LOG, 'Pull error:', err.message);
  } finally {
    isPulling = false;
    // Clear any dirty flags that were set during pull
    dirtyTrackIds.clear();
    dirtyEditionTrackIds.clear();
    isSyncing = false;
  }
}

// ─── Push local changes to cloud ─────────────────────

export async function pushToCloud(): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!user || isSyncing) return;

  isSyncing = true;
  try {
    const allTracks = usePlayerStore.getState().tracks;
    const settings = useSettingsStore.getState();

    // On first push after login, push everything; after that only dirty items
    const tracksToPush = isInitialPushDone
      ? allTracks.filter(t => dirtyTrackIds.has(t.id))
      : allTracks;
    const editionTrackIds = isInitialPushDone
      ? [...dirtyEditionTrackIds]
      : Object.keys(settings.trackEditions);

    // Clear dirty sets before push (new changes during push will re-dirty)
    dirtyTrackIds.clear();
    dirtyEditionTrackIds.clear();

    if (tracksToPush.length === 0 && editionTrackIds.length === 0) {
      console.log(SYNC_LOG, 'Nothing to push');
      return;
    }

    console.log(SYNC_LOG, `Pushing ${tracksToPush.length} tracks, ${editionTrackIds.length} edition groups...`);

    let pushed = 0;

    // Push tracks (with or without analysis)
    for (const track of tracksToPush) {
      if (track.mediaType === 'youtube') continue;

      let fileHash: string | undefined;
      try {
        fileHash = await computeQuickHash(track.uri, track.fileSize);
      } catch {}

      const a = track.analysis;
      const { data: remoteId, error } = await supabase.rpc('upsert_track_with_analysis', {
        p_title: track.title,
        p_media_type: track.mediaType,
        p_fingerprint: a?.fingerprint ?? null,
        p_file_hash: fileHash ?? null,
        p_file_size: track.fileSize ?? null,
        p_format: track.format ?? null,
        p_duration: track.duration ? track.duration / 1000 : a?.duration ?? null,
        p_youtube_url: null,
        p_youtube_video_id: null,
        p_dance_style: 'bachata',
        p_folder_id: null,
        p_bpm: a?.bpm ?? null,
        p_beats: JSON.stringify(a?.beats ?? []),
        p_downbeats: JSON.stringify(a?.downbeats ?? []),
        p_beats_per_bar: a?.beatsPerBar ?? 4,
        p_confidence: a?.confidence ?? 0,
        p_sections: JSON.stringify(a?.sections ?? []),
        p_phrase_boundaries: JSON.stringify(a?.phraseBoundaries ?? []),
        p_waveform_peaks: JSON.stringify(a?.waveformPeaks ?? []),
      });

      if (!error) {
        pushed++;
        // Save local URI for same-device restore
        if (remoteId && track.uri) {
          await supabase.from('player_tracks').update({ local_uri: track.uri }).eq('id', remoteId);
        }
      }
    }

    // Push YouTube tracks (with or without analysis)
    for (const track of tracksToPush) {
      if (track.mediaType !== 'youtube') continue;

      const a = track.analysis;
      const { error } = await supabase.rpc('upsert_track_with_analysis', {
        p_title: track.title,
        p_media_type: 'youtube',
        p_fingerprint: null,
        p_file_hash: null,
        p_file_size: null,
        p_format: 'youtube',
        p_duration: a?.duration ?? null,
        p_youtube_url: `https://www.youtube.com/watch?v=${track.uri}`,
        p_youtube_video_id: track.uri,
        p_dance_style: 'bachata',
        p_folder_id: null,
        p_bpm: a?.bpm ?? null,
        p_beats: JSON.stringify(a?.beats ?? []),
        p_downbeats: JSON.stringify(a?.downbeats ?? []),
        p_beats_per_bar: a?.beatsPerBar ?? 4,
        p_confidence: a?.confidence ?? 0,
        p_sections: JSON.stringify(a?.sections ?? []),
        p_phrase_boundaries: JSON.stringify(a?.phraseBoundaries ?? []),
        p_waveform_peaks: JSON.stringify(a?.waveformPeaks ?? []),
      });

      if (!error) pushed++;
    }

    // Push editions — use fileHash as fingerprint since server analysis doesn't provide one
    let editionsPushed = 0;
    for (const trackId of editionTrackIds) {
      const editions = settings.trackEditions[trackId];
      if (!editions) continue;
      const track = allTracks.find(t => t.id === trackId);
      if (!track?.analysis) continue;

      let fp = track.analysis.fingerprint;
      if (!fp && track.mediaType !== 'youtube') {
        try { fp = await computeQuickHash(track.uri, track.fileSize); } catch {}
      }
      if (!fp) continue;

      for (const edition of editions.userEditions) {
        if (edition.id === 'S') continue;
        const cellNotes = settings.cellNotes[trackId] ?? null;
        const { error } = await supabase.from('user_editions').upsert({
          user_id: user.id,
          fingerprint: fp,
          edition_type: 'phrase',
          slot_id: edition.id,
          edition_data: edition.boundaries,
          cell_notes: cellNotes,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,fingerprint,edition_type,slot_id' });
        if (!error) editionsPushed++;
      }
    }

    // Push formation editions
    for (const trackId of editionTrackIds) {
      const formations = settings.trackFormations[trackId];
      if (!formations) continue;
      const track = allTracks.find(t => t.id === trackId);
      if (!track?.analysis) continue;

      let fp = track.analysis.fingerprint;
      if (!fp && track.mediaType !== 'youtube') {
        try { fp = await computeQuickHash(track.uri, track.fileSize); } catch {}
      }
      if (!fp) continue;

      for (const edition of formations.userEditions) {
        if (edition.id === 'S') continue;
        const { error } = await supabase.from('user_editions').upsert({
          user_id: user.id,
          fingerprint: fp,
          edition_type: 'formation',
          slot_id: edition.id,
          edition_data: edition.data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,fingerprint,edition_type,slot_id' });
        if (!error) editionsPushed++;
      }
    }

    isInitialPushDone = true;
    console.log(SYNC_LOG, `Pushed: ${pushed} tracks, ${editionsPushed} editions`);
  } catch (err: any) {
    console.warn(SYNC_LOG, 'Push error:', err.message);
  } finally {
    isSyncing = false;
  }
}

// ─── Replace local tracks with cloud data ────────────
// Server is source of truth. Local-only tracks (not yet pushed) are preserved.

async function mergeTracksFromCloud(remoteTracks: any[]): Promise<void> {
  const localTracks = usePlayerStore.getState().tracks;
  const store = usePlayerStore.getState();

  // Build set of remote track IDs for cleanup
  const remoteIds = new Set(remoteTracks.map((r: any) => r.id));
  const remoteTitles = new Set(remoteTracks.map((r: any) => `${r.title}|${r.format ?? ''}`));

  // Remove local tracks that were deleted from server
  // (has remoteId or cloud- prefix but no longer in server)
  for (const local of localTracks) {
    const isFromCloud = local.remoteId || local.id.startsWith('cloud-');
    if (isFromCloud) {
      const rid = local.remoteId || local.id.replace('cloud-', '');
      const titleKey = `${local.title}|${local.format}`;
      if (!remoteIds.has(rid) && !remoteTitles.has(titleKey)) {
        store.removeTrack(local.id);
      }
    }
  }

  // Re-read after removals
  const currentTracks = usePlayerStore.getState().tracks;

  for (const remote of remoteTracks) {
    const analysisRow = Array.isArray(remote.track_analyses)
      ? remote.track_analyses[0]
      : remote.track_analyses;

    // Find local match
    const localMatch = currentTracks.find(t => {
      if (t.remoteId === remote.id) return true;
      if (t.id === `cloud-${remote.id}`) return true;
      if (remote.youtube_video_id && t.mediaType === 'youtube') return t.uri === remote.youtube_video_id;
      if (remote.title && t.title === remote.title && remote.format && t.format === remote.format) return true;
      if (remote.file_hash && t.analysis?.fingerprint) return t.analysis.fingerprint === remote.file_hash;
      return false;
    });

    const analysis: AnalysisResult | undefined = analysisRow ? {
      bpm: analysisRow.bpm,
      beats: analysisRow.beats ?? [],
      downbeats: analysisRow.downbeats ?? [],
      duration: remote.duration ?? 0,
      beatsPerBar: analysisRow.beats_per_bar ?? 4,
      confidence: analysisRow.confidence ?? 0,
      sections: analysisRow.sections ?? [],
      phraseBoundaries: analysisRow.phrase_boundaries ?? [],
      waveformPeaks: analysisRow.waveform_peaks ?? [],
      fingerprint: analysisRow.fingerprint ?? remote.file_hash ?? undefined,
    } : undefined;

    if (localMatch) {
      // Update analysis if cloud has it and local doesn't
      if (analysis && !localMatch.analysis) {
        store.setTrackAnalysis(localMatch.id, analysis);
      }
    } else {
      // Create from cloud
      const isYouTube = remote.media_type === 'youtube';

      if (!isYouTube) {
        // Non-YouTube tracks: only sync if file exists locally
        // Different devices have different file paths — don't create ghost tracks
        const localUri = remote.local_uri || '';
        if (!localUri) {
          console.log(SYNC_LOG, `Skip cloud track (no file): ${remote.title}`);
          continue;
        }
        // Check if the local file actually exists on THIS device
        try {
          const { getInfoAsync } = require('expo-file-system/legacy');
          const info = await getInfoAsync(localUri);
          if (!info.exists) {
            console.log(SYNC_LOG, `Skip cloud track (file not on device): ${remote.title}`);
            continue;
          }
        } catch {
          console.log(SYNC_LOG, `Skip cloud track (file check failed): ${remote.title}`);
          continue;
        }
      }

      const newTrack: Track = {
        id: `cloud-${remote.id}`,
        title: remote.title,
        uri: isYouTube ? remote.youtube_video_id : (remote.local_uri || ''),
        fileSize: remote.file_size ?? 0,
        format: remote.format ?? 'mp3',
        mediaType: remote.media_type as any,
        duration: remote.duration ? remote.duration * 1000 : undefined,
        importedAt: new Date(remote.created_at).getTime(),
        analysis,
        analysisStatus: analysis ? 'done' : 'idle',
        remoteId: remote.id,
      };
      store.addTrack(newTrack);
    }
  }
}

// ─── Merge remote editions into local store ──────────

function mergeEditionsFromCloud(remoteEditions: any[]): void {
  const settings = useSettingsStore.getState();
  // Re-read tracks AFTER mergeTracksFromCloud has added cloud tracks
  const tracks = usePlayerStore.getState().tracks;

  // Build fingerprint → trackId lookup (check analysis.fingerprint AND remoteId's file_hash)
  const fpToTrackId = new Map<string, string>();
  for (const t of tracks) {
    if (t.analysis?.fingerprint) fpToTrackId.set(t.analysis.fingerprint, t.id);
    // Cloud-created tracks store file_hash in analysis.fingerprint via merge
    if (t.remoteId) {
      // Also try matching by remote track's file_hash stored in analysis
      if (t.analysis?.fingerprint) fpToTrackId.set(t.analysis.fingerprint, t.id);
    }
  }

  // Debug: log all track IDs for matching
  for (const [fp, tid] of fpToTrackId) {
    console.log(SYNC_LOG, `  fp=${fp.slice(0, 12)}... → trackId=${tid}`);
  }
  console.log(SYNC_LOG, `Edition merge: ${fpToTrackId.size} fingerprints mapped, ${remoteEditions.length} remote editions`);

  for (const row of remoteEditions) {
    const trackId = fpToTrackId.get(row.fingerprint);
    if (!trackId) {
      console.log(SYNC_LOG, `Edition skip: no track for fp=${row.fingerprint.slice(0, 12)}...`);
      continue;
    }
    // Validate boundaries against track's beat count
    const track = tracks.find(t => t.id === trackId);
    const beatCount = track?.analysis?.beats?.length ?? 0;
    if (row.edition_type === 'phrase' && Array.isArray(row.edition_data) && beatCount > 0) {
      const maxBoundary = Math.max(...row.edition_data);
      if (maxBoundary >= beatCount) {
        console.log(SYNC_LOG, `Edition skip: boundaries out of range (max=${maxBoundary}, beats=${beatCount})`);
        continue;
      }
    }

    console.log(SYNC_LOG, `Edition apply: slot=${row.slot_id} type=${row.edition_type} → trackId=${trackId}, boundaries=${JSON.stringify(row.edition_data).slice(0, 50)}`);

    const remoteUpdated = new Date(row.updated_at).getTime();

    if (row.edition_type === 'phrase') {
      const localEditions = settings.trackEditions[trackId];
      const localEdition = localEditions?.userEditions.find(e => e.id === row.slot_id);

      // Remote is newer or local doesn't have it → apply
      if (!localEdition || remoteUpdated > localEdition.updatedAt) {
        settings.setEditionBoundaries(trackId, row.slot_id as EditionId, row.edition_data);
        if (row.cell_notes) {
          for (const [beatIdx, note] of Object.entries(row.cell_notes)) {
            settings.setCellNote(trackId, Number(beatIdx), note as string);
          }
        }
      }
    } else if (row.edition_type === 'formation') {
      const localFormations = settings.trackFormations[trackId];
      const localEdition = localFormations?.userEditions.find(e => e.id === row.slot_id);

      if (!localEdition || remoteUpdated > localEdition.updatedAt) {
        settings.setFormationEdition(trackId, row.slot_id as FormationEditionId, row.edition_data as FormationData);
      }
    }
  }
}

// ─── Delete track from cloud ─────────────────────────

export async function deleteTrackFromCloud(track: Track): Promise<void> {
  const { user } = useAuthStore.getState();
  if (!user) return;

  try {
    // Delete by title + format (matches unique constraint)
    const { error } = await supabase
      .from('player_tracks')
      .delete()
      .eq('user_id', user.id)
      .eq('title', track.title)
      .eq('format', track.format ?? '');

    if (error) {
      console.warn(SYNC_LOG, 'Delete track from cloud failed:', error.message);
      return;
    }

    // Also delete editions by fingerprint
    let fp = track.analysis?.fingerprint;
    if (!fp && track.uri && track.mediaType !== 'youtube') {
      try { fp = await computeQuickHash(track.uri, track.fileSize); } catch {}
    }
    if (fp) {
      await supabase.from('user_editions').delete().eq('user_id', user.id).eq('fingerprint', fp);
    }

    console.log(SYNC_LOG, `Deleted from cloud: ${track.title}`);
  } catch (err: any) {
    console.warn(SYNC_LOG, 'Delete error:', err.message);
  }
}
