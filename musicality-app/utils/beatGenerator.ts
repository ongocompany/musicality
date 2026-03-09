// Synthetic beat generator for tap-tempo mode (YouTube / manual BPM)
// Generates evenly-spaced beat & downbeat arrays from BPM + start time,
// compatible with the existing getCountInfo() pipeline.

import { AnalysisResult } from '../types/analysis';

/**
 * Generate synthetic beats and downbeats from a known BPM + anchor point.
 *
 * @param bpm           Beats per minute (e.g. 128)
 * @param durationMs    Total track duration in milliseconds
 * @param anchorTimeMs  The "Now is 1" anchor — ms position of beat 1
 * @returns AnalysisResult with evenly-spaced beats/downbeats (seconds)
 */
export function generateSyntheticAnalysis(
  bpm: number,
  durationMs: number,
  anchorTimeMs: number,
): AnalysisResult {
  if (bpm <= 0 || durationMs <= 0) {
    return {
      bpm,
      beats: [],
      downbeats: [],
      duration: durationMs / 1000,
      beatsPerBar: 4,
      confidence: 1.0,
    };
  }

  const intervalMs = 60000 / bpm;
  const durationSec = durationMs / 1000;
  const anchorSec = anchorTimeMs / 1000;
  const intervalSec = intervalMs / 1000;

  const beats: number[] = [];

  // Generate beats backwards from anchor to start
  let t = anchorSec;
  while (t >= 0) {
    beats.push(round3(t));
    t -= intervalSec;
  }
  beats.reverse();

  // Generate beats forwards from anchor to end
  t = anchorSec + intervalSec;
  while (t <= durationSec) {
    beats.push(round3(t));
    t += intervalSec;
  }

  // Downbeats: every 4th beat starting from the anchor
  // Find anchor index in the beats array
  const anchorIdx = beats.findIndex(
    (b) => Math.abs(b - round3(anchorSec)) < 0.001,
  );

  const downbeats: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    // beats at anchor + n*4 positions are downbeats
    if ((i - anchorIdx) % 4 === 0) {
      downbeats.push(beats[i]);
    }
  }

  return {
    bpm: Math.round(bpm * 10) / 10,
    beats,
    downbeats,
    duration: durationSec,
    beatsPerBar: 4,
    confidence: 1.0, // synthetic = perfect regularity
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
