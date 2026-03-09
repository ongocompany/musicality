// Phrase detection algorithms for Latin dance music.
// Generates PhraseMap from beats[] using three strategies:
// 1. Rule-based: fixed phrase length (default 32 beats = 4 eight-counts)
// 2. User-marked: user taps a phrase boundary → calculate length → project all
// 3. Server boundaries: convert server-detected timestamps to phrases

import { Phrase, PhraseMap, PhraseDetectionMode } from '../types/analysis';
import { findNearestBeatIndex } from './beatCounter';

/**
 * Build a Phrase array from start beat indices.
 * Each consecutive pair of starts defines one phrase.
 */
function buildPhrases(
  starts: number[],
  beats: number[],
  duration: number,
): Phrase[] {
  if (starts.length === 0) return [];

  const phrases: Phrase[] = [];
  for (let i = 0; i < starts.length; i++) {
    const startIdx = starts[i];
    const endIdx = i + 1 < starts.length ? starts[i + 1] : beats.length;
    phrases.push({
      index: i,
      startBeatIndex: startIdx,
      endBeatIndex: endIdx,
      startTime: startIdx < beats.length ? beats[startIdx] : duration,
      endTime: endIdx < beats.length ? beats[endIdx] : duration,
    });
  }
  return phrases;
}

/**
 * Method 1: Rule-based (client-only, instant).
 * Splits beats into fixed-length phrases starting from the reference index.
 * Generates phrases both forward and backward from refIndex.
 */
export function detectPhrasesRuleBased(
  beats: number[],
  refIndex: number,
  beatsPerPhrase: number = 32,
  duration: number,
): PhraseMap {
  if (beats.length === 0) {
    return { phrases: [], beatsPerPhrase, detectionMode: 'rule-based' };
  }

  // Ensure beatsPerPhrase is a multiple of 8, minimum 8
  const bpp = Math.max(8, Math.round(beatsPerPhrase / 8) * 8);
  const ref = Math.max(0, Math.min(refIndex, beats.length - 1));

  // Collect phrase start indices
  const starts: number[] = [];

  // Go backward from refIndex
  for (let i = ref; i >= 0; i -= bpp) {
    starts.unshift(i);
  }

  // Go forward from refIndex (skip refIndex itself, already added)
  for (let i = ref + bpp; i < beats.length; i += bpp) {
    starts.push(i);
  }

  // Deduplicate (in case ref === 0)
  const unique = [...new Set(starts)].sort((a, b) => a - b);

  return {
    phrases: buildPhrases(unique, beats, duration),
    beatsPerPhrase: bpp,
    detectionMode: 'rule-based',
  };
}

/**
 * Method 2: User-marked.
 * User taps at a phrase boundary. Calculate phrase length from the distance
 * between refIndex and the marked beat, then project all phrases.
 */
export function detectPhrasesFromUserMark(
  beats: number[],
  refIndex: number,
  markBeatIndex: number,
  duration: number,
): PhraseMap {
  if (beats.length === 0) {
    return { phrases: [], beatsPerPhrase: 32, detectionMode: 'user-marked' };
  }

  // Calculate phrase length from mark distance
  let phraseLen = Math.abs(markBeatIndex - refIndex);

  // Round to nearest multiple of 8 (must be at least 8)
  phraseLen = Math.max(8, Math.round(phraseLen / 8) * 8);

  // Use rule-based with the computed phrase length
  const result = detectPhrasesRuleBased(beats, refIndex, phraseLen, duration);
  return {
    ...result,
    detectionMode: 'user-marked',
  };
}

/**
 * Method 3: Server-detected boundaries → phrases.
 * Convert server boundary timestamps to beat indices and build phrases.
 */
export function phrasesFromBoundaries(
  beats: number[],
  boundaries: number[],
  duration: number,
): PhraseMap {
  if (beats.length === 0 || boundaries.length === 0) {
    return { phrases: [], beatsPerPhrase: 0, detectionMode: 'server' };
  }

  // Convert boundary timestamps to beat indices
  const starts: number[] = [0]; // always start from beat 0
  for (const timeSec of boundaries) {
    const idx = findNearestBeatIndex(timeSec * 1000, beats);
    if (idx >= 0 && idx > starts[starts.length - 1]) {
      starts.push(idx);
    }
  }

  // Estimate average beats per phrase
  let totalBeats = 0;
  for (let i = 1; i < starts.length; i++) {
    totalBeats += starts[i] - starts[i - 1];
  }
  const avgBpp = starts.length > 1
    ? Math.round(totalBeats / (starts.length - 1) / 8) * 8
    : 32;

  return {
    phrases: buildPhrases(starts, beats, duration),
    beatsPerPhrase: avgBpp || 32,
    detectionMode: 'server',
  };
}
