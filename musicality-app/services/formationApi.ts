import { API_BASE_URL } from '../constants/config';
import { FormationData } from '../types/formation';
import { AnalysisResult } from '../types/analysis';

/**
 * Request formation suggestions from the server based on analysis results.
 * Synchronous response — lightweight computation, no polling needed.
 */
export async function requestFormationSuggestion(
  analysis: AnalysisResult,
  dancerCount: number,
  danceStyle: string,
): Promise<FormationData> {
  const body = {
    dancer_count: dancerCount,
    dance_style: danceStyle,
    beats: analysis.beats,
    bpm: analysis.bpm,
    sections: analysis.sections?.map((s) => ({
      label: s.label,
      start_time: s.startTime,
      end_time: s.endTime,
      confidence: s.confidence,
    })) ?? [],
    phrase_boundaries: analysis.phraseBoundaries ?? [],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_BASE_URL}/formations/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    return data.formation as FormationData;
  } finally {
    clearTimeout(timeout);
  }
}
