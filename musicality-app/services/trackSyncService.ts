/**
 * Track sync service — syncs mobile tracks to/from Supabase.
 *
 * Key design:
 * - Media files stay on device. Only metadata + analysis syncs.
 * - file_hash (SHA-256) identifies the same file across devices.
 * - YouTube tracks match by youtube_video_id.
 */

import { supabase } from '../lib/supabase';
import { Track } from '../types/track';
import { AnalysisResult, Section } from '../types/analysis';
import { computeQuickHash } from '../utils/fileHash';

// ─── Types ───────────────────────────────────────────

interface RemoteTrack {
  id: string;
  title: string;
  mediaType: string;
  fingerprint: string | null;
  fileHash: string | null;
  fileSize: number | null;
  format: string | null;
  duration: number | null;
  youtubeUrl: string | null;
  youtubeVideoId: string | null;
  danceStyle: string;
  createdAt: string;
}

interface RemoteAnalysis {
  id: string;
  trackId: string;
  bpm: number;
  beats: number[];
  downbeats: number[];
  beatsPerBar: number;
  confidence: number;
  sections: Section[];
  phraseBoundaries: number[];
  waveformPeaks: number[];
  fingerprint: string | null;
}

// ─── Upload track to Supabase ────────────────────────

export async function syncTrackToCloud(track: Track): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    // Compute file hash for non-YouTube tracks
    let fileHash: string | undefined;
    if (track.mediaType !== 'youtube' && track.uri) {
      try {
        fileHash = await computeQuickHash(track.uri, track.fileSize);
      } catch {
        // Hash computation failed — continue without it
      }
    }

    const analysis = track.analysis;

    // Extract YouTube video ID from URI if youtube type
    let youtubeVideoId: string | undefined;
    let youtubeUrl: string | undefined;
    if (track.mediaType === 'youtube') {
      youtubeVideoId = track.uri; // Mobile stores video ID in uri
      youtubeUrl = `https://www.youtube.com/watch?v=${track.uri}`;
    }

    const { data, error } = await supabase.rpc('upsert_track_with_analysis', {
      p_title: track.title,
      p_media_type: track.mediaType,
      p_fingerprint: analysis?.fingerprint ?? null,
      p_file_hash: fileHash ?? null,
      p_file_size: track.fileSize ?? null,
      p_format: track.format ?? null,
      p_duration: track.duration
        ? track.duration / 1000
        : analysis?.duration ?? null,
      p_youtube_url: youtubeUrl ?? null,
      p_youtube_video_id: youtubeVideoId ?? null,
      p_dance_style: 'bachata',
      p_folder_id: null,
      p_bpm: analysis?.bpm ?? null,
      p_beats: analysis?.beats ? JSON.stringify(analysis.beats) : '[]',
      p_downbeats: analysis?.downbeats
        ? JSON.stringify(analysis.downbeats)
        : '[]',
      p_beats_per_bar: analysis?.beatsPerBar ?? 4,
      p_confidence: analysis?.confidence ?? 0,
      p_sections: analysis?.sections
        ? JSON.stringify(analysis.sections)
        : '[]',
      p_phrase_boundaries: analysis?.phraseBoundaries
        ? JSON.stringify(analysis.phraseBoundaries)
        : '[]',
      p_waveform_peaks: analysis?.waveformPeaks
        ? JSON.stringify(analysis.waveformPeaks)
        : '[]',
    });

    if (error) {
      console.error('Sync to cloud failed:', error.message);
      return null;
    }

    return data as string;
  } catch (err: any) {
    console.error('Sync to cloud error:', err.message);
    return null;
  }
}

// ─── Load tracks from Supabase ───────────────────────

export async function loadTracksFromCloud(): Promise<
  Array<{
    remote: RemoteTrack;
    analysis: AnalysisResult | null;
  }>
> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from('player_tracks')
      .select('*, track_analyses(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Load from cloud failed:', error.message);
      return [];
    }

    return (data ?? []).map((row: any) => {
      const analysisRow = Array.isArray(row.track_analyses)
        ? row.track_analyses[0]
        : row.track_analyses;

      const analysis: AnalysisResult | null = analysisRow
        ? {
            bpm: analysisRow.bpm,
            beats: analysisRow.beats ?? [],
            downbeats: analysisRow.downbeats ?? [],
            duration: row.duration ?? 0,
            beatsPerBar: analysisRow.beats_per_bar ?? 4,
            confidence: analysisRow.confidence ?? 0,
            sections: analysisRow.sections ?? [],
            phraseBoundaries: analysisRow.phrase_boundaries ?? [],
            waveformPeaks: analysisRow.waveform_peaks ?? [],
            fingerprint: analysisRow.fingerprint ?? undefined,
          }
        : null;

      return {
        remote: {
          id: row.id,
          title: row.title,
          mediaType: row.media_type,
          fingerprint: row.fingerprint,
          fileHash: row.file_hash,
          fileSize: row.file_size,
          format: row.format,
          duration: row.duration,
          youtubeUrl: row.youtube_url,
          youtubeVideoId: row.youtube_video_id,
          danceStyle: row.dance_style,
          createdAt: row.created_at,
        },
        analysis,
      };
    });
  } catch (err: any) {
    console.error('Load from cloud error:', err.message);
    return [];
  }
}

// ─── Sync all analyzed tracks ────────────────────────

export async function syncAllTracksToCloud(
  tracks: Track[],
): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  let synced = 0;
  const toSync = tracks.filter((t) => t.analysis && !t.remoteId);

  for (const track of toSync) {
    const remoteId = await syncTrackToCloud(track);
    if (remoteId) synced++;
  }

  return synced;
}

// ─── Match track by file hash ────────────────────────

export async function matchTrackByHash(
  uri: string,
  fileSize?: number,
): Promise<AnalysisResult | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const hash = await computeQuickHash(uri, fileSize);

    const { data, error } = await supabase.rpc(
      'match_track_by_fingerprint',
      { p_fingerprint: hash },
    );

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      bpm: row.bpm,
      beats: row.beats ?? [],
      downbeats: row.downbeats ?? [],
      duration: 0,
      beatsPerBar: row.beats_per_bar ?? 4,
      confidence: row.confidence ?? 0,
      sections: (row.sections ?? []) as Section[],
      phraseBoundaries: row.phrase_boundaries ?? [],
      waveformPeaks: row.waveform_peaks ?? [],
      fingerprint: hash,
    };
  } catch {
    return null;
  }
}

// ─── Delete from Supabase ─────────────────────────────

export async function deleteTrackFromCloud(
  remoteId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('player_tracks')
      .delete()
      .eq('id', remoteId);

    if (error) {
      console.error('Delete from cloud failed:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
