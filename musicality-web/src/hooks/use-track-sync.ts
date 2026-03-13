'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useWebPlayerStore, type LocalTrack, type Folder } from '@/stores/web-player-store';
import {
  fetchPlayerTracks,
  upsertTrackWithAnalysis,
  deletePlayerTrack,
  matchTrackByFingerprint,
  fetchPlayerFolders,
  createPlayerFolder,
  deletePlayerFolder,
} from '@/lib/api';
import { computeQuickHash } from '@/utils/file-hash';
import type { PlayerTrack, PlayerFolder, TrackAnalysis } from '@/lib/types';

/**
 * Track sync hook — bridges local web player with Supabase.
 *
 * Architecture (교집합 model):
 * - Media files stay LOCAL (browser IndexedDB). Only metadata + analysis syncs.
 * - SHA-256 fingerprint identifies the same file across devices.
 * - On loadFromCloud: file-based tracks only appear if local file exists (matched by fingerprint).
 *   YouTube tracks always appear (URL is universal).
 * - Each device shows: intersection(local ∩ cloud) + device-only local tracks.
 * - Sync conflicts: LWW (Last-Write-Wins) based on updated_at.
 */

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

export function useTrackSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const { tracks, addTrack, updateTrack, folders } = useWebPlayerStore();

  // ─── Helper: get authenticated supabase client ──────

  const getAuthenticatedClient = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSyncError('Not logged in');
      return null;
    }
    return { supabase, user };
  }, []);

  // ─── Upload a local track to Supabase ────────────────

  const syncTrackToCloud = useCallback(
    async (localTrack: LocalTrack): Promise<string | null> => {
      const auth = await getAuthenticatedClient();
      if (!auth) return null;

      try {
        // Use existing fingerprint or compute from file
        let fileHash = localTrack.fingerprint;
        if (!fileHash && localTrack.file) {
          fileHash = await computeQuickHash(localTrack.file);
        }

        const analysis = localTrack.analysis;

        // Upsert to Supabase
        const remoteId = await upsertTrackWithAnalysis(auth.supabase, {
          title: localTrack.title,
          mediaType: localTrack.mediaType,
          fingerprint: fileHash,
          fileHash,
          fileSize: localTrack.fileSize ?? undefined,
          format: localTrack.format ?? undefined,
          duration: localTrack.duration
            ? localTrack.duration / 1000
            : undefined,
          youtubeUrl: localTrack.youtubeUrl,
          youtubeVideoId: localTrack.youtubeVideoId,
          folderId: localTrack.folderId,
          // Analysis data
          bpm: analysis?.bpm,
          beats: analysis?.beats,
          downbeats: analysis?.downbeats,
          beatsPerBar: analysis?.beatsPerBar,
          confidence: analysis?.confidence,
          sections: analysis?.sections,
          phraseBoundaries: analysis?.phraseBoundaries,
          waveformPeaks: analysis?.waveformPeaks,
        });

        // Update local track with remote reference
        updateTrack(localTrack.id, {
          remoteTrack: { id: remoteId } as PlayerTrack,
          fingerprint: fileHash ?? localTrack.fingerprint,
        });

        return remoteId;
      } catch (err: any) {
        console.error('Sync to cloud failed:', err.message);
        setSyncError(err.message);
        return null;
      }
    },
    [getAuthenticatedClient, updateTrack],
  );

  // ─── Load tracks from Supabase (교집합 model) ─────────
  //
  // File-based tracks: only shown if local file exists (matched by fingerprint).
  // YouTube tracks: always added (URL is universal, no local file needed).

  const loadFromCloud = useCallback(async (): Promise<PlayerTrack[]> => {
    const auth = await getAuthenticatedClient();
    if (!auth) return [];

    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const remoteTracks = await fetchPlayerTracks(auth.supabase);

      // Build lookup maps for local tracks
      const localByRemoteId = new Map<string, LocalTrack>();
      const localByFingerprint = new Map<string, LocalTrack>();
      const localByYouTubeId = new Map<string, LocalTrack>();

      for (const t of tracks) {
        if (t.remoteTrack?.id) localByRemoteId.set(t.remoteTrack.id, t);
        if (t.fingerprint) localByFingerprint.set(t.fingerprint, t);
        if (t.youtubeVideoId) localByYouTubeId.set(t.youtubeVideoId, t);
      }

      for (const remote of remoteTracks) {
        // 1. Already linked by remote ID → update metadata (LWW)
        const linkedTrack = localByRemoteId.get(remote.id);
        if (linkedTrack) {
          // LWW: if remote has newer analysis, update local
          if (remote.analysis && !linkedTrack.analysis) {
            updateTrack(linkedTrack.id, {
              analysis: remote.analysis,
              analysisStatus: 'done',
            });
          }
          continue;
        }

        // 2. YouTube track → match by videoId or add (no local file needed)
        if (remote.mediaType === 'youtube' && remote.youtubeVideoId) {
          const existing = localByYouTubeId.get(remote.youtubeVideoId);
          if (existing) {
            // Link existing local YouTube track to remote
            updateTrack(existing.id, {
              remoteTrack: remote,
              analysis: remote.analysis ?? existing.analysis,
              analysisStatus: remote.analysis ? 'done' : existing.analysisStatus,
            });
          } else {
            // Add YouTube track (playable without local file)
            const localTrack: LocalTrack = {
              id: `cloud_${remote.id}`,
              title: remote.title,
              mediaType: 'youtube',
              fileUrl: '',
              duration: remote.duration ? remote.duration * 1000 : null,
              fileSize: remote.fileSize,
              format: 'youtube',
              youtubeUrl: remote.youtubeUrl ?? undefined,
              youtubeVideoId: remote.youtubeVideoId ?? undefined,
              folderId: remote.folderId ?? undefined,
              analysis: remote.analysis,
              analysisStatus: remote.analysis ? 'done' : 'idle',
              remoteTrack: remote,
            };
            addTrack(localTrack);
          }
          continue;
        }

        // 3. File-based track → only add if local file matches (교집합)
        //    Match by fingerprint (SHA-256 hash of file content)
        if (remote.fingerprint || remote.fileHash) {
          const fp = remote.fingerprint ?? remote.fileHash ?? '';
          const existing = localByFingerprint.get(fp);
          if (existing) {
            // Found matching local file! Link + merge analysis
            updateTrack(existing.id, {
              remoteTrack: remote,
              analysis: remote.analysis ?? existing.analysis,
              analysisStatus: remote.analysis ? 'done' : existing.analysisStatus,
              folderId: remote.folderId ?? existing.folderId,
            });
          }
          // If no local file matches → skip (교집합: don't show tracks without local files)
        }
        // If no fingerprint → skip (can't match without identifier)
      }

      setSyncStatus('done');
      return remoteTracks;
    } catch (err: any) {
      console.error('Load from cloud failed:', err.message);
      setSyncError(err.message);
      setSyncStatus('error');
      return [];
    }
  }, [tracks, addTrack, updateTrack, getAuthenticatedClient]);

  // ─── Sync all analyzed local tracks to cloud ─────────

  const syncAllToCloud = useCallback(async (): Promise<number> => {
    const auth = await getAuthenticatedClient();
    if (!auth) return 0;

    setSyncStatus('syncing');
    setSyncError(null);

    let synced = 0;

    try {
      // Sync tracks that have analysis and aren't already synced
      const toSync = tracks.filter(
        (t) => t.analysis && !t.remoteTrack,
      );

      for (const track of toSync) {
        const remoteId = await syncTrackToCloud(track);
        if (remoteId) synced++;
      }

      // Also sync folders
      await syncFoldersToCloud();

      setSyncStatus('done');
      return synced;
    } catch (err: any) {
      console.error('Sync all failed:', err.message);
      setSyncError(err.message);
      setSyncStatus('error');
      return synced;
    }
  }, [tracks, syncTrackToCloud, getAuthenticatedClient]);

  // ─── Match file by hash (check if analysis exists) ───

  const matchByHash = useCallback(
    async (file: File): Promise<TrackAnalysis | null> => {
      const auth = await getAuthenticatedClient();
      if (!auth) return null;

      try {
        const hash = await computeQuickHash(file);
        const result = await matchTrackByFingerprint(auth.supabase, hash);
        return result;
      } catch {
        return null;
      }
    },
    [getAuthenticatedClient],
  );

  // ─── Auto-match: when a file is added, check Supabase for existing analysis ───

  const autoMatchAndAttach = useCallback(
    async (trackId: string, fingerprint: string): Promise<boolean> => {
      const auth = await getAuthenticatedClient();
      if (!auth) return false;

      try {
        const analysis = await matchTrackByFingerprint(auth.supabase, fingerprint);
        if (analysis) {
          updateTrack(trackId, {
            analysis,
            analysisStatus: 'done',
            fingerprint,
          });
          console.log(`[Sync] Auto-matched analysis for track ${trackId} via fingerprint`);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [getAuthenticatedClient, updateTrack],
  );

  // ─── Delete from cloud ──────────────────────────────

  const deleteFromCloud = useCallback(
    async (localTrack: LocalTrack): Promise<boolean> => {
      if (!localTrack.remoteTrack?.id) return false;

      const auth = await getAuthenticatedClient();
      if (!auth) return false;

      try {
        await deletePlayerTrack(auth.supabase, localTrack.remoteTrack.id);
        updateTrack(localTrack.id, { remoteTrack: undefined });
        return true;
      } catch (err: any) {
        console.error('Delete from cloud failed:', err.message);
        return false;
      }
    },
    [getAuthenticatedClient, updateTrack],
  );

  // ─── Folder Sync ──────────────────────────────────────

  const syncFoldersToCloud = useCallback(async (): Promise<void> => {
    const auth = await getAuthenticatedClient();
    if (!auth) return;

    try {
      const remoteFolders = await fetchPlayerFolders(auth.supabase);
      const remoteFolderNames = new Set(remoteFolders.map((f) => f.name));

      // Push local folders that don't exist in cloud
      for (const localFolder of folders) {
        if (!remoteFolderNames.has(localFolder.name)) {
          await createPlayerFolder(auth.supabase, {
            name: localFolder.name,
            mediaType: localFolder.mediaType,
          });
        }
      }
    } catch (err: any) {
      console.error('Folder sync failed:', err.message);
    }
  }, [folders, getAuthenticatedClient]);

  const loadFoldersFromCloud = useCallback(async (): Promise<PlayerFolder[]> => {
    const auth = await getAuthenticatedClient();
    if (!auth) return [];

    try {
      const remoteFolders = await fetchPlayerFolders(auth.supabase);

      // Add remote folders that don't exist locally (by name match)
      const localFolderNames = new Set(folders.map((f) => f.name));
      const { createFolder } = useWebPlayerStore.getState();

      for (const rf of remoteFolders) {
        if (!localFolderNames.has(rf.name)) {
          createFolder(rf.name, rf.mediaType as 'audio' | 'video' | 'youtube');
        }
      }

      return remoteFolders;
    } catch (err: any) {
      console.error('Load folders from cloud failed:', err.message);
      return [];
    }
  }, [folders, getAuthenticatedClient]);

  return {
    syncStatus,
    syncError,
    syncTrackToCloud,
    loadFromCloud,
    syncAllToCloud,
    matchByHash,
    autoMatchAndAttach,
    deleteFromCloud,
    syncFoldersToCloud,
    loadFoldersFromCloud,
  };
}
