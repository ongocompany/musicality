import { API_BASE_URL, ANALYSIS_TIMEOUT_MS } from '../constants/config';
import { AnalysisResult } from '../types/analysis';

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
  };
}

/**
 * Poll the server for analysis job completion.
 */
async function pollForResult(
  jobId: string,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  while (!signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    if (signal.aborted) break;

    const response = await fetch(`${API_BASE_URL}/analyze/status/${jobId}`, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Status check failed (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (data.status === 'done') {
      return mapAnalysisResult(data.result);
    }

    if (data.status === 'error') {
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
export async function analyzeTrack(
  uri: string,
  fileName: string,
  format: string,
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

  const formData = new FormData();
  formData.append('file', {
    uri: uploadUri,
    name: `${fileName || 'track'}.${uploadFormat}`,
    type: uploadMime || mimeMap[uploadFormat] || 'audio/mpeg',
  } as any);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  console.log(`[Upload] Sending ${uploadFormat} to ${API_BASE_URL}/analyze (uri: ${uploadUri.slice(-50)})`);

  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

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

    // 202 Accepted → async job, poll for result
    if (response.status === 202 && data.job_id) {
      return await pollForResult(data.job_id, controller.signal);
    }

    // 200 OK → cache hit, result is directly in response
    return mapAnalysisResult(data);
  } finally {
    clearTimeout(timeout);
  }
}
