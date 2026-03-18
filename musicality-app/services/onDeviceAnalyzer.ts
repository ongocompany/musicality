/**
 * onDeviceAnalyzer.ts
 *
 * On-device audio analysis engine using the music-tempo library (Beatroot algorithm).
 * Replaces server-based analysis (analysisApi.ts) for BPM and beat detection.
 *
 * ─── Pipeline ──────────────────────────────────────────────────────────────
 *   fileUri + format
 *     → decodeAudioToPCM()         [utils/audioDecoder.ts]
 *     → MusicTempo(pcmData)         [music-tempo: Beatroot algorithm]
 *     → inferDownbeats()            [every 4th beat = downbeat 1]
 *     → extractWaveformPeaks()      [visualization peaks]
 *     → calculateConfidence()       [beat interval consistency score]
 *     → OnDeviceAnalysisResult
 *
 * ─── music-tempo notes ─────────────────────────────────────────────────────
 *   Input:  Float32Array — mono PCM, nominal range [-1, +1]
 *           Ideally 22050Hz sample rate (the library default assumes ~44100Hz
 *           but works well with 22050Hz since it uses relative timing)
 *   Output: { tempo: number, beats: number[] } — tempo in BPM, beats in seconds
 *   Throws: string "Tempo extraction failed" if analysis fails (not an Error object)
 *
 * ─── Limitations ───────────────────────────────────────────────────────────
 *   - No downbeat detection → inferred by rule (beats[0], [4], [8], ...)
 *   - No section detection (derecho/mambo) → Phase 3 ML model
 *   - JS single-thread: ~1-5s for a 3-minute track on modern device
 *   - Accuracy slightly lower than Madmom for complex polyrhythmic latin music
 *     (user correction UX already exists to compensate)
 *
 * ─── TODO ──────────────────────────────────────────────────────────────────
 * TODO: Run analysis in background thread using runAfterInteractions or
 *       a worker pattern to prevent UI blocking on slow devices
 * TODO: Expose a progress callback (onset detection ~60%, beat tracking ~40%)
 * TODO: Tune minBeatInterval/maxBeatInterval for bachata (100-130 BPM) vs
 *       salsa (160-220 BPM) — consider auto-range or genre hint param
 * TODO: Investigate music-tempo's sampleRate assumption — verify 22050Hz input
 *       produces correct beat timings (the library uses hopSize=441 samples)
 * TODO: Add InteractionManager.runAfterInteractions() wrapper for UI safety
 */

import MusicTempo from 'music-tempo';
import { AnalysisResult } from '../types/analysis';
import { decodeAudioToPCM } from '../utils/audioDecoder';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * On-device analysis result.
 * Superset of AnalysisResult — includes extra fields for data collection pipeline.
 * Compatible with AnalysisResult via toAnalysisResult().
 */
export interface OnDeviceAnalysisResult {
  /** BPM (beats per minute), rounded to nearest integer */
  bpm: number;
  /** Beat timestamps in seconds */
  beats: number[];
  /** Downbeat (beat 1) timestamps in seconds — inferred at every 4th beat */
  downbeats: number[];
  /** Track duration in seconds */
  duration: number;
  /** Beats per bar (always 4 for our use case — 4/4 time) */
  beatsPerBar: 4;
  /** Analysis confidence 0–1 (based on beat interval consistency) */
  confidence: number;
  /** Normalized amplitude peaks for waveform visualization, length = waveformResolution */
  waveformPeaks: number[];
  /** Analysis engine version — used for data collection tracking */
  analysisEngine: 'on-device-v1';
  /** Wall-clock time taken for analysis in ms */
  analysisTimeMs: number;
}

// ─── Parameters ──────────────────────────────────────────────────────────────

/** BPM range for Latin dance music */
const LATIN_DANCE_BPM = {
  /** Bachata: ~100–130 BPM. Salsa: ~160–220 BPM. Allow wider range for edge cases. */
  min: 60,
  max: 220,
} as const;

/** Number of waveform peaks to extract for visualization */
const WAVEFORM_RESOLUTION = 200;

// ─── Waveform peaks extraction ────────────────────────────────────────────────

/**
 * Extract amplitude envelope peaks from PCM data for waveform visualization.
 * Divides the signal into `resolution` windows, picks max absolute amplitude per window.
 * Result is normalized to [0, 1].
 *
 * @param pcmData   - Float32Array PCM samples
 * @param resolution - number of peaks to extract (one per segment)
 */
function extractWaveformPeaks(pcmData: Float32Array, resolution: number): number[] {
  const windowSize = Math.floor(pcmData.length / resolution);
  if (windowSize === 0) return Array(resolution).fill(0);

  const peaks: number[] = new Array(resolution);
  let globalMax = 0;

  for (let i = 0; i < resolution; i++) {
    const start = i * windowSize;
    const end = Math.min(start + windowSize, pcmData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(pcmData[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }

  // Normalize to [0, 1]
  if (globalMax > 0) {
    for (let i = 0; i < resolution; i++) {
      peaks[i] = peaks[i] / globalMax;
    }
  }

  return peaks;
}

// ─── Confidence calculation ───────────────────────────────────────────────────

/**
 * Calculate beat consistency confidence (0–1).
 *
 * Method: coefficient of variation (CV) of inter-beat intervals.
 * Lower CV = more consistent beats = higher confidence.
 *
 * Perfect metronome → confidence ≈ 1.0
 * Very irregular rhythm → confidence ≈ 0.0
 *
 * @param beats - array of beat timestamps in seconds
 */
function calculateConfidence(beats: number[]): number {
  if (beats.length < 4) return 0;

  const intervals = beats.slice(1).map((b, i) => b - beats[i]);
  const n = intervals.length;

  const mean = intervals.reduce((sum, v) => sum + v, 0) / n;
  if (mean <= 0) return 0;

  const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;  // coefficient of variation

  // CV of ~0.01–0.05 is typical for a well-tracked beat
  // Map CV to confidence: cv=0 → 1.0, cv=0.3 → 0.0
  const confidence = Math.max(0, Math.min(1, 1 - cv / 0.3));
  return Math.round(confidence * 1000) / 1000;  // 3 decimal places
}

// ─── Downbeat inference ───────────────────────────────────────────────────────

/**
 * Infer downbeat positions from beat array.
 *
 * music-tempo does not detect downbeats (beat 1 of each bar).
 * Rule: every 4th beat starting from index 0 is a downbeat.
 *
 * This is a simplification — in practice, the first beat may not align
 * with bar boundaries. User can correct this via the phrase offset UI.
 *
 * TODO: Improve with onset strength analysis — find the strongest onset
 *       near expected downbeat positions (bars of 4 beats)
 * TODO: For bachata, consider checking for the distinctive "step" pattern
 *       (beats 1-2-3, pause-5-6-7, pause) as a rhythm template
 *
 * @param beats - all beat timestamps in seconds
 * @param beatsPerBar - typically 4 (4/4 time)
 */
function inferDownbeats(beats: number[], beatsPerBar: number): number[] {
  return beats.filter((_, index) => index % beatsPerBar === 0);
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

/**
 * Perform on-device BPM and beat detection using music-tempo.
 *
 * @param fileUri - file:// URI of the audio file to analyze
 * @param format  - file extension without dot (e.g. 'mp3', 'wav', 'm4a')
 * @returns OnDeviceAnalysisResult
 * @throws Error if PCM decoding fails or music-tempo cannot extract tempo
 *
 * @example
 * const result = await analyzeOnDevice('file:///storage/.../song.mp3', 'mp3');
 * console.log(`BPM: ${result.bpm}, Beats: ${result.beats.length}`);
 */
export async function analyzeOnDevice(
  fileUri: string,
  format: string,
): Promise<OnDeviceAnalysisResult> {
  const startTime = Date.now();

  // ── Step 1: Decode audio to PCM ──────────────────────────────────────────
  // TODO: Add loading progress callback here (e.g. onProgress(0.1, 'Decoding...'))
  const { pcmData, sampleRate, duration } = await decodeAudioToPCM(fileUri, format);

  console.log(
    `[OnDeviceAnalyzer] Decoded: ${duration.toFixed(1)}s @ ${sampleRate}Hz, ` +
    `${pcmData.length} samples (${(pcmData.length * 4 / 1024 / 1024).toFixed(1)} MB)`
  );

  // ── Step 2: BPM + beat detection via music-tempo ─────────────────────────
  // music-tempo params:
  //   minBeatInterval: min seconds between beats = 60 / maxBPM
  //   maxBeatInterval: max seconds between beats = 60 / minBPM
  //
  // NOTE: music-tempo assumes 44100Hz sample rate internally (hopSize=441 → 10ms frames).
  // With 22050Hz input, frame duration is 20ms → beat timings will be 2x larger.
  // We compensate by halving all timestamps IF sampleRate < 30000.
  //
  // TODO: Verify this compensation is correct with real-world test files
  // TODO: Alternatively, set hopSize=220 for 22050Hz input (requires music-tempo fork)

  // TODO: Add progress callback here (e.g. onProgress(0.5, 'Detecting beats...'))
  let mt: InstanceType<typeof MusicTempo>;
  try {
    mt = new MusicTempo(pcmData, {
      minBeatInterval: 60 / LATIN_DANCE_BPM.max,  // 0.273s = 220 BPM max
      maxBeatInterval: 60 / LATIN_DANCE_BPM.min,  // 1.0s = 60 BPM min
    });
  } catch (err: unknown) {
    // music-tempo throws a string (not an Error) on failure
    const msg = typeof err === 'string' ? err : 'music-tempo analysis failed';
    throw new Error(`Beat detection failed: ${msg}. ` +
      'The audio may be too short, silent, or have an unusual rhythm pattern.');
  }

  // Apply sample rate compensation if needed
  const sampleRateCompensation = sampleRate < 30000 ? (sampleRate / 44100) : 1.0;
  // music-tempo returns tempo as string (toFixed(3)) — parse to number
  const rawTempo = parseFloat(String(mt.tempo));
  const rawBeats: number[] = mt.beats;

  // music-tempo assumes 44100Hz (hopSize=441 → 10ms frames).
  // With 22050Hz input, frames are 20ms → tempo is 2x, beat times are 0.5x.
  // Fix: multiply tempo by compensation (halve it), divide beat times by compensation (double them).
  const bpm = Math.round(rawTempo * sampleRateCompensation);
  const beats = rawBeats.map((t: number) => t / sampleRateCompensation);

  console.log(
    `[OnDeviceAnalyzer] music-tempo raw: tempo=${rawTempo.toFixed(1)} BPM, ` +
    `beats=${rawBeats.length}, compensation=${sampleRateCompensation.toFixed(3)}`
  );
  console.log(`[OnDeviceAnalyzer] Adjusted: BPM=${bpm}, first beat=${beats[0]?.toFixed(3)}s`);

  // ── Step 3: Infer downbeats ───────────────────────────────────────────────
  const downbeats = inferDownbeats(beats, 4);

  // ── Step 4: Extract waveform peaks for visualization ─────────────────────
  // TODO: Add progress callback here (e.g. onProgress(0.9, 'Generating waveform...'))
  const waveformPeaks = extractWaveformPeaks(pcmData, WAVEFORM_RESOLUTION);

  // ── Step 5: Calculate confidence ─────────────────────────────────────────
  const confidence = calculateConfidence(beats);

  const analysisTimeMs = Date.now() - startTime;
  console.log(
    `[OnDeviceAnalyzer] Done in ${analysisTimeMs}ms: ` +
    `BPM=${bpm}, beats=${beats.length}, downbeats=${downbeats.length}, confidence=${confidence}`
  );

  return {
    bpm,
    beats,
    downbeats,
    duration,
    beatsPerBar: 4,
    confidence,
    waveformPeaks,
    analysisEngine: 'on-device-v1',
    analysisTimeMs,
  };
}

// ─── AnalysisResult adapter ───────────────────────────────────────────────────

/**
 * Convert OnDeviceAnalysisResult to the existing AnalysisResult type.
 * Preserves full compatibility with playerStore and beat counter utilities.
 *
 * Usage (in index.tsx runAnalysis):
 *   const raw = await analyzeOnDevice(track.uri, track.format);
 *   const analysis = toAnalysisResult(raw);
 *   setTrackAnalysis(track.id, analysis);
 */
export function toAnalysisResult(result: OnDeviceAnalysisResult): AnalysisResult {
  return {
    bpm: result.bpm,
    beats: result.beats,
    downbeats: result.downbeats,
    duration: result.duration,
    beatsPerBar: result.beatsPerBar,
    confidence: result.confidence,
    sections: [],             // On-device: no section detection (Phase 3)
    phraseBoundaries: [],     // On-device: rule-based phrase detection handles this
    waveformPeaks: result.waveformPeaks,
    // fingerprint: not implemented yet (Phase 3)
  };
}
