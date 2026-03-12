/**
 * Synthetic beat generator from BPM.
 * Generates evenly-spaced beats & downbeats for tap tempo / manual BPM mode.
 * Ported from mobile app's beatGenerator.ts.
 */

import type { TrackAnalysis } from '@/lib/types';

/**
 * Generate a synthetic TrackAnalysis from BPM + duration.
 *
 * @param bpm        Beats per minute (60-300)
 * @param durationMs Total duration in milliseconds
 * @param anchorMs   Anchor point (ms) — the "beat 1" reference. Beats expand
 *                   backwards/forwards from this point. Default = 0.
 * @returns Partial TrackAnalysis with beats, downbeats, bpm, etc.
 */
export function generateSyntheticAnalysis(
  bpm: number,
  durationMs: number,
  anchorMs: number = 0,
): TrackAnalysis {
  const intervalMs = 60000 / bpm;         // ms per beat
  const intervalSec = intervalMs / 1000;  // seconds per beat
  const durationSec = durationMs / 1000;
  const anchorSec = anchorMs / 1000;

  const beats: number[] = [];

  // Generate beats backwards from anchor to start
  let t = anchorSec;
  while (t >= 0) {
    beats.push(t);
    t -= intervalSec;
  }
  beats.reverse();

  // Generate beats forward from anchor
  t = anchorSec + intervalSec;
  while (t <= durationSec) {
    beats.push(t);
    t += intervalSec;
  }

  // Remove duplicates and sort
  const uniqueBeats = [...new Set(beats.map((b) => Math.round(b * 10000) / 10000))];
  uniqueBeats.sort((a, b) => a - b);

  // Find anchor index in final array
  let anchorIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < uniqueBeats.length; i++) {
    const dist = Math.abs(uniqueBeats[i] - anchorSec);
    if (dist < minDist) {
      minDist = dist;
      anchorIdx = i;
    }
  }

  // Downbeats: every 4th beat starting from anchor
  const downbeats: number[] = [];
  // Go backwards from anchor
  for (let i = anchorIdx; i >= 0; i -= 4) {
    downbeats.push(uniqueBeats[i]);
  }
  downbeats.reverse();
  // Go forwards from anchor
  for (let i = anchorIdx + 4; i < uniqueBeats.length; i += 4) {
    downbeats.push(uniqueBeats[i]);
  }

  return {
    id: '',
    trackId: '',
    userId: '',
    bpm,
    beats: uniqueBeats,
    downbeats,
    beatsPerBar: 4,
    confidence: 1.0,
    sections: [],
    phraseBoundaries: [],
    waveformPeaks: [],
    fingerprint: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate beats array only (lighter version).
 * Returns beat times in seconds.
 */
export function generateBeatsFromBPM(
  bpm: number,
  durationSec: number,
  anchorSec: number = 0,
): number[] {
  const interval = 60 / bpm;
  const beats: number[] = [];

  // Backwards from anchor
  let t = anchorSec;
  while (t >= 0) {
    beats.push(Math.round(t * 10000) / 10000);
    t -= interval;
  }
  beats.reverse();

  // Forwards from anchor
  t = anchorSec + interval;
  while (t <= durationSec) {
    beats.push(Math.round(t * 10000) / 10000);
    t += interval;
  }

  return beats;
}
