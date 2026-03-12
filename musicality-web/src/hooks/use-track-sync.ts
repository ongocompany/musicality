'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useWebPlayerStore, type LocalTrack } from '@/stores/web-player-store';
import {
  fetchPlayerTracks,
  upsertTrackWithAnalysis,
  deletePlayerTrack,
  matchTrackByFingerprint,
} from '@/lib/api';
import { computeQuickHash } from '@/utils/file-hash';
import type { PlayerTrack, TrackAnalysis } from '@/lib/types';

/**
 * Track sync hook — bridges local web player with Supabase.
 *
 * Key concepts:
 * - Media files stay LOCAL (browser). Only metadata + analysis syncs.
 * - SHA-256 file hash identifies the same file across devices.
 * - When loading from Supabase, tracks appear in library but need
 *   local file re-attachment to play (except YouTube).
 */

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

export function useTrackSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const { tracks, addTrack, updateTrack } = useWebPlayerStore();

  // ─── Upload a local track to Supabase ────────────────

  const syncTrackToCloud = useCallback(
    async (localTrack: LocalTrack): Promise<string | null> => {
      const supabase = createClient();

      // Check auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSyncError('Not logged in');
        return null;
      }

      try {
        // Compute file hash if we have a file
        let fileHash: string | undefined;
        if (localTrack.file) {
          fileHash = await computeQuickHash(localTrack.file);
        }

        const analysis = localTrack.analysis;

        // Upsert to Supabase
        const remoteId = await upsertTrackWithAnalysis(supabase, {
          title: localTrack.title,
          mediaType: localTrack.mediaType,
          fileHash,
          fileSize: localTrack.fileSize ?? undefined,
          format: localTrack.format ?? undefined,
          duration: localTrack.duration
            ? localTrack.duration / 1000
            : undefined,
          youtubeUrl: localTrack.youtubeUrl,
          youtubeVideoId: localTrack.youtubeVideoId,
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
        });

        return remoteId;
      } catch (err: any) {
        console.error('Sync to cloud failed:', err.message);
        setSyncError(err.message);
        return null;
      }
    },
    [updateTrack],
  );

  // ─── Load tracks from Supabase into local library ────

  const loadFromCloud = useCallback(async (): Promise<PlayerTrack[]> => {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSyncError('Not logged in');
      return [];
    }

    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const remoteTracks = await fetchPlayerTracks(supabase);

      // Add remote tracks that aren't already in local library
      const localIds = new Set(tracks.map((t) => t.remoteTrack?.id).filter(Boolean));

      for (const remote of remoteTracks) {
        if (localIds.has(remote.id)) continue;

        // Check if we already have this track locally (by YouTube video ID)
        if (remote.youtubeVideoId) {
          const existing = tracks.find(
            (t) => t.youtubeVideoId === remote.youtubeVideoId,
          );
          if (existing) {
            // Link existing local track to remote
            updateTrack(existing.id, { remoteTrack: remote });
            continue;
          }
        }

        // Create local track entry (without file — needs re-attachment)
        const localTrack: LocalTrack = {
          id: `cloud_${remote.id}`,
          title: remote.title,
          mediaType: remote.mediaType,
          fileUrl: '', // No local file yet
          duration: remote.duration ? remote.duration * 1000 : null,
          fileSize: remote.fileSize,
          format: remote.format,
          youtubeUrl: remote.youtubeUrl ?? undefined,
          youtubeVideoId: remote.youtubeVideoId ?? undefined,
          analysis: remote.analysis,
          analysisStatus: remote.analysis ? 'done' : 'idle',
          remoteTrack: remote,
        };

        addTrack(localTrack);
      }

      setSyncStatus('done');
      return remoteTracks;
    } catch (err: any) {
      console.error('Load from cloud failed:', err.message);
      setSyncError(err.message);
      setSyncStatus('error');
      return [];
    }
  }, [tracks, addTrack, updateTrack]);

  // ─── Sync all analyzed local tracks to cloud ─────────

  const syncAllToCloud = useCallback(async (): Promise<number> => {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSyncError('Not logged in');
      return 0;
    }

    setSyncStatus('syncing');
    setSyncError(null);

    let synced = 0;

    try {
      // Only sync tracks that have analysis and aren't already synced
      const toSync = tracks.filter(
        (t) => t.analysis && !t.remoteTrack,
      );

      for (const track of toSync) {
        const remoteId = await syncTrackToCloud(track);
        if (remoteId) synced++;
      }

      setSyncStatus('done');
      return synced;
    } catch (err: any) {
      console.error('Sync all failed:', err.message);
      setSyncError(err.message);
      setSyncStatus('error');
      return synced;
    }
  }, [tracks, syncTrackToCloud]);

  // ─── Match file by hash (check if analysis exists) ───

  const matchByHash = useCallback(
    async (file: File): Promise<TrackAnalysis | null> => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      try {
        const hash = await computeQuickHash(file);
        const result = await matchTrackByFingerprint(supabase, hash);
        return result;
      } catch {
        return null;
      }
    },
    [],
  );

  // ─── Delete from cloud ──────────────────────────────

  const deleteFromCloud = useCallback(
    async (localTrack: LocalTrack): Promise<boolean> => {
      if (!localTrack.remoteTrack?.id) return false;

      const supabase = createClient();

      try {
        await deletePlayerTrack(supabase, localTrack.remoteTrack.id);
        updateTrack(localTrack.id, { remoteTrack: undefined });
        return true;
      } catch (err: any) {
        console.error('Delete from cloud failed:', err.message);
        return false;
      }
    },
    [updateTrack],
  );

  return {
    syncStatus,
    syncError,
    syncTrackToCloud,
    loadFromCloud,
    syncAllToCloud,
    matchByHash,
    deleteFromCloud,
  };
}
