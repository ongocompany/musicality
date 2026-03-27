import { API_BASE_URL, ANALYSIS_TIMEOUT_MS } from '../constants/config';
import { AnalysisResult } from '../types/analysis';
import { supabase } from '../lib/supabase';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds

/**
 * Check if the analysis server is reachable.
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Map server snake_case response to camelCase AnalysisResult.
 */
function mapAnalysisResult(data: any): AnalysisResult {
  return {
    bpm: data.bpm,
    beats: data.beats,
    downbeats: data.downbeats,
    duration: data.duration,
    beatsPerBar: data.beats_per_bar,
    confidence: data.confidence,
    sections: data.sections?.map((s: any) => ({
      label: s.label,
      startTime: s.start_time,
      endTime: s.end_time,
      confidence: s.confidence,
    })),
    phraseBoundaries: data.phrase_boundaries ?? [],
    waveformPeaks: data.waveform_peaks ?? [],
    fingerprint: data.fingerprint ?? undefined,
    metadata: data.metadata ? {
      title: data.metadata.title,
      artist: data.metadata.artist,
      album: data.metadata.album,
      albumArtUrl: data.metadata.album_art_url,
      releaseId: data.metadata.release_id,
    } : undefined,
    cloudTrackId: data.cloud_track_id ?? undefined,
  };
}

/**
 * Poll the server for analysis job completion.
 */
async function pollForResult(
  jobId: string,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  let pollCount = 0;
  while (!signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    if (signal.aborted) break;
    pollCount++;

    const response = await fetch(`${API_BASE_URL}/analyze/status/${jobId}`, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Status check failed (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (data.status === 'done') {
      console.log(`[Analysis] Poll #${pollCount}: done`);
      return mapAnalysisResult(data.result);
    }

    if (data.status === 'error') {
      console.error(`[Analysis] Poll #${pollCount}: server error — ${data.error}`);
      throw new Error(data.error || 'Analysis failed on server');
    }

    // status === 'processing' → continue polling
  }

  throw new Error('Analysis timed out');
}

/**
 * Upload an audio file to the analysis server and return beat analysis results.
 * Handles both sync (200 cache hit) and async (202 background job) responses.
 */
/**
 * Resume polling for a previously started analysis job.
 * Used when app returns from background with a pending job.
 */
export async function resumeAnalysisJob(
  jobId: string,
  timeoutMs: number = ANALYSIS_TIMEOUT_MS,
): Promise<AnalysisResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Check if already done before starting poll loop
    const initial = await fetch(`${API_BASE_URL}/analyze/status/${jobId}`, {
      signal: controller.signal,
    });
    if (initial.ok) {
      const data = await initial.json();
      if (data.status === 'done') return mapAnalysisResult(data.result);
      if (data.status === 'error') throw new Error(data.error || 'Analysis failed on server');
    }
    return await pollForResult(jobId, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upload an audio file to the analysis server and return beat analysis results.
 * Handles both sync (200 cache hit) and async (202 background job) responses.
 * onJobId is called immediately when a job_id is received, before polling starts.
 */
export async function analyzeTrack(
  uri: string,
  fileName: string,
  format: string,
  onJobId?: (jobId: string) => void,
): Promise<AnalysisResult> {
  // For video files, extract audio via native module; for audio files, send original
  let uploadUri = uri;
  let uploadFormat = format;
  let uploadMime = '';
  const isVideoFile = ['mp4', 'mov', 'avi', 'mkv', 'm4v'].includes(format.toLowerCase());
  if (isVideoFile) {
    try {
      const { extractAndDownsample } = require('../modules/my-module');
      console.log(`[AudioExtractor] Starting: ${fileName}.${format} (${uri.slice(-30)})`);
      const t0 = Date.now();
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Extract timeout (10s)')), 10000)
      );
      const processed = await Promise.race([extractAndDownsample(uri), timeoutPromise]);
      console.log(`[AudioExtractor] Done in ${Date.now() - t0}ms → ${processed?.slice(-40)}`);
      if (processed) {
        uploadUri = processed.startsWith('/') ? `file://${processed}` : processed;
        uploadFormat = 'wav';
        uploadMime = 'audio/wav';
      }
    } catch (e: any) {
      console.warn(`[AudioExtractor] FAILED for ${fileName}.${format}: ${e?.message}`);
      // Fallback: send original file
    }
  }

  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };

  // Sanitize file name for network upload (spaces/parens break RN networking)
  const safeName = (fileName || 'track').replace(/[^a-zA-Z0-9._-]/g, '_');

  const formData = new FormData();
  formData.append('file', {
    uri: uploadUri,
    name: `${safeName}.${uploadFormat}`,
    type: uploadMime || mimeMap[uploadFormat] || 'audio/mpeg',
  } as any);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  const t0 = Date.now();

  // ── Pre-check: compute file hash and check cache without uploading ──
  try {
    const fileBase64 = await FileSystem.readAsStringAsync(uploadUri, { encoding: FileSystem.EncodingType.Base64 });
    const fileHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, fileBase64);
    console.log(`[Analysis] Hash check: ${fileHash.slice(0, 12)}...`);

    const checkResp = await fetch(`${API_BASE_URL}/analyze/check/${fileHash}`, {
      signal: controller.signal,
    });
    if (checkResp.ok) {
      const result = mapAnalysisResult(await checkResp.json());
      const checkMs = Date.now() - t0;
      console.log(`[Analysis] Hash pre-check HIT: BPM=${result.bpm}, total=${(checkMs / 1000).toFixed(1)}s (no upload!)`);
      clearTimeout(timeout);
      return result;
    }
    // 404 = not cached, proceed with upload
  } catch (e: any) {
    // Hash check failed (non-critical), proceed with upload
    console.debug(`[Analysis] Hash pre-check skipped: ${e.message?.slice(0, 50)}`);
  }

  console.log(`[Analysis] Uploading ${uploadFormat} to ${API_BASE_URL}/analyze (${uploadUri.slice(-50)})`);

  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    const uploadMs = Date.now() - t0;
    console.log(`[Analysis] Upload done in ${(uploadMs / 1000).toFixed(1)}s — HTTP ${response.status}`);

    // 429 → already analyzing, poll existing job
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      if (data.job_id) {
        console.log(`[Analysis] Already in progress, polling existing job: ${data.job_id}`);
        onJobId?.(data.job_id);
        const result = await pollForResult(data.job_id, controller.signal);
        return result;
      }
      throw new Error('Analysis already in progress. Please wait.');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let detail = `Server error (HTTP ${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) detail = errorJson.detail;
      } catch {
        if (errorText.length > 0 && errorText.length < 200) {
          detail = `HTTP ${response.status}: ${errorText}`;
        }
      }
      throw new Error(detail);
    }

    const data = await response.json();

    // 202 Accepted → async job, save jobId immediately then poll
    if (response.status === 202 && data.job_id) {
      console.log(`[Analysis] Job queued: ${data.job_id}, polling...`);
      onJobId?.(data.job_id);
      const result = await pollForResult(data.job_id, controller.signal);
      const totalMs = Date.now() - t0;
      console.log(`[Analysis] Complete: BPM=${result.bpm}, beats=${result.beats.length}, confidence=${result.confidence}, total=${(totalMs / 1000).toFixed(1)}s (upload=${(uploadMs / 1000).toFixed(1)}s)`);
      return result;
    }

    // 200 OK → cache hit, result is directly in response
    const result = mapAnalysisResult(data);
    const totalMs = Date.now() - t0;
    console.log(`[Analysis] Cache hit: BPM=${result.bpm}, beats=${result.beats.length}, total=${(totalMs / 1000).toFixed(1)}s`);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Register a track to user's cloud library after analysis.
 * Non-blocking, best-effort — failures are logged but don't affect the user.
 */
export async function registerCloudTrack(
  cloudTrackId: string,
  title?: string,
  danceStyle: string = 'bachata',
  folderName?: string,
): Promise<void> {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;  // Not logged in — skip

    const resp = await fetch(`${API_BASE_URL}/cloud/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cloud_track_id: cloudTrackId,
        custom_title: title,
        dance_style: danceStyle,
        folder_name: folderName,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      console.log(`[CloudLibrary] Registered: ${data.status}`);
    } else {
      console.warn(`[CloudLibrary] Register failed: ${resp.status}`);
    }
  } catch (e: any) {
    console.warn(`[CloudLibrary] Register error: ${e.message}`);
  }
}
