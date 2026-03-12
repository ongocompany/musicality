/**
 * Web analysis API service.
 * Uploads audio file to FastAPI server and returns beat analysis results.
 */

const API_BASE_URL = 'https://api.ritmo.kr';
const ANALYSIS_TIMEOUT_MS = 300_000; // 5 minutes

export interface AnalysisResultRaw {
  bpm: number;
  beats: number[];
  downbeats: number[];
  duration: number;
  beatsPerBar: number;
  confidence: number;
  sections: { label: string; startTime: number; endTime: number; confidence: number }[];
  phraseBoundaries: number[];
  waveformPeaks: number[];
  fingerprint?: string;
}

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
 * Upload a File object to the analysis server.
 * Web version — uses File directly (not uri like mobile).
 */
export async function analyzeTrackWeb(file: File): Promise<AnalysisResultRaw> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `Server error: ${response.status}`);
    }

    const data = await response.json();

    // Map snake_case response to camelCase
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
      })) ?? [],
      phraseBoundaries: data.phrase_boundaries ?? [],
      waveformPeaks: data.waveform_peaks ?? [],
      fingerprint: data.fingerprint ?? undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
