/**
 * Web analysis API service.
 * Uploads audio file to FastAPI server and returns beat analysis results.
 * Supports async analysis: cache hit → instant, cache miss → poll for result.
 */

const API_BASE_URL = 'https://api.ritmo.kr';
const ANALYSIS_TIMEOUT_MS = 600_000; // 10 minutes (async polling total)
const POLL_INTERVAL_MS = 3_000; // Poll every 3 seconds

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

/** Map snake_case server response to camelCase */
function mapResult(data: any): AnalysisResultRaw {
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
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll for async analysis result.
 */
async function pollForResult(
  jobId: string,
  signal?: AbortSignal,
): Promise<AnalysisResultRaw> {
  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('Analysis cancelled');
    }

    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(`${API_BASE_URL}/analyze/status/${jobId}`, {
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(err.detail || `Status check failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'done') {
      return mapResult(data.result);
    }

    if (data.status === 'error') {
      throw new Error(data.error || 'Analysis failed on server');
    }

    // status === 'processing' → continue polling
  }

  throw new Error('Analysis timed out');
}

/**
 * Upload a File object to the analysis server.
 * - Cache HIT (200) → instant result
 * - Cache MISS (202) → polls until result ready
 */
export async function analyzeTrackWeb(file: File): Promise<AnalysisResultRaw> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const controller = new AbortController();
  const uploadTimeout = setTimeout(() => controller.abort(), 90_000); // 90s upload limit

  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(uploadTimeout);

    if (response.status === 200) {
      // Cache hit — instant result
      const data = await response.json();
      return mapResult(data);
    }

    if (response.status === 202) {
      // Cache miss — async analysis, poll for result
      const { job_id } = await response.json();
      return await pollForResult(job_id);
    }

    // Error
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `Server error: ${response.status}`);
    }

    // Fallback: try parsing as direct result
    const data = await response.json();
    return mapResult(data);
  } catch (err) {
    clearTimeout(uploadTimeout);
    throw err;
  }
}
