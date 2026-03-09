import { API_BASE_URL, ANALYSIS_TIMEOUT_MS } from '../constants/config';
import { AnalysisResult } from '../types/analysis';

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
 * Upload an audio file to the analysis server and return beat analysis results.
 */
export async function analyzeTrack(
  uri: string,
  fileName: string,
  format: string,
): Promise<AnalysisResult> {
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
    uri,
    name: `${fileName || 'track'}.${format}`,
    type: mimeMap[format] || 'audio/mpeg',
  } as any);

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
      })),
      phraseBoundaries: data.phrase_boundaries ?? [],
      waveformPeaks: data.waveform_peaks ?? [],
    };
  } finally {
    clearTimeout(timeout);
  }
}
