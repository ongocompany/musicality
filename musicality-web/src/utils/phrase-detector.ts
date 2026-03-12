/**
 * Phrase detection engine for web player.
 * Ported from mobile app's phraseDetector.ts.
 */

import { findNearestBeatIndex, computeReferenceIndex } from './beat-counter';
import type { Section } from './beat-counter';

// ─── Types ────────────────────────────────────────────

export type PhraseDetectionMode = 'rule-based' | 'user-marked' | 'server';

export interface Phrase {
  index: number;           // 0-based phrase number
  startBeatIndex: number;  // index into beats[]
  endBeatIndex: number;    // exclusive
  startTime: number;       // seconds
  endTime: number;         // seconds
}

export interface PhraseMap {
  phrases: Phrase[];
  beatsPerPhrase: number;  // e.g., 32
  detectionMode: PhraseDetectionMode;
}

// ─── Colors ───────────────────────────────────────────

export const PHRASE_COLORS: string[] = [
  '#FF4444', // red
  '#FF8C00', // orange
  '#FFD700', // yellow
  '#44BB44', // green
  '#4488FF', // blue
  '#6A5ACD', // slate blue
  '#9B59B6', // violet
];

export function getPhraseColor(phraseIndex: number): string {
  return PHRASE_COLORS[phraseIndex % PHRASE_COLORS.length];
}

// ─── Helpers ──────────────────────────────────────────

/**
 * Build Phrase[] from sorted start-beat-indices + beats array.
 */
function buildPhrases(startIndices: number[], beats: number[], totalBeats: number): Phrase[] {
  const phrases: Phrase[] = [];
  for (let i = 0; i < startIndices.length; i++) {
    const start = startIndices[i];
    const end = i + 1 < startIndices.length ? startIndices[i + 1] : totalBeats;
    if (start >= end) continue;

    phrases.push({
      index: i,
      startBeatIndex: start,
      endBeatIndex: end,
      startTime: beats[start] ?? 0,
      endTime: end < beats.length ? beats[end] : (beats[beats.length - 1] ?? 0) + 0.5,
    });
  }
  return phrases;
}

// ─── Detection modes ──────────────────────────────────

/**
 * Rule-based: fixed-length phrases (default 32 beats = 4 eight-counts).
 * Generates forward/backward from a reference index.
 */
export function detectPhrasesRuleBased(
  beats: number[],
  downbeats: number[],
  offsetBeatIndex: number | null,
  beatsPerPhrase: number = 32,
  sections?: Section[],
): PhraseMap {
  if (beats.length === 0) {
    return { phrases: [], beatsPerPhrase, detectionMode: 'rule-based' };
  }

  const refIdx = computeReferenceIndex(beats, downbeats, offsetBeatIndex, sections);
  const totalBeats = beats.length;
  const starts: number[] = [];

  // Forward from reference
  for (let idx = refIdx; idx < totalBeats; idx += beatsPerPhrase) {
    starts.push(idx);
  }

  // Backward from reference
  for (let idx = refIdx - beatsPerPhrase; idx >= 0; idx -= beatsPerPhrase) {
    starts.unshift(idx);
  }

  return {
    phrases: buildPhrases(starts, beats, totalBeats),
    beatsPerPhrase,
    detectionMode: 'rule-based',
  };
}

/**
 * From server phrase boundaries (timestamps in seconds → beat indices).
 */
export function phrasesFromBoundaries(
  boundaries: number[],
  beats: number[],
  beatsPerPhrase: number = 32,
): PhraseMap {
  if (beats.length === 0 || boundaries.length === 0) {
    return { phrases: [], beatsPerPhrase, detectionMode: 'server' };
  }

  const starts: number[] = [];
  for (const bSec of boundaries) {
    const idx = findNearestBeatIndex(bSec * 1000, beats);
    if (idx >= 0 && !starts.includes(idx)) {
      starts.push(idx);
    }
  }

  // Ensure index 0 is included as a starting point
  if (!starts.includes(0)) starts.unshift(0);
  starts.sort((a, b) => a - b);

  return {
    phrases: buildPhrases(starts, beats, beats.length),
    beatsPerPhrase,
    detectionMode: 'server',
  };
}

/**
 * From user-defined beat indices (boundaries).
 */
export function phrasesFromBeatIndices(
  boundaryIndices: number[],
  beats: number[],
  beatsPerPhrase: number = 32,
): PhraseMap {
  if (beats.length === 0) {
    return { phrases: [], beatsPerPhrase, detectionMode: 'user-marked' };
  }

  const starts = [...boundaryIndices].sort((a, b) => a - b);
  if (!starts.includes(0)) starts.unshift(0);

  return {
    phrases: buildPhrases(starts, beats, beats.length),
    beatsPerPhrase,
    detectionMode: 'user-marked',
  };
}

/**
 * Extract boundary beat indices from existing phrases.
 */
export function extractBoundaries(phraseMap: PhraseMap): number[] {
  return phraseMap.phrases.map((p) => p.startBeatIndex);
}

/**
 * Find which phrase contains a given beat index.
 */
export function findPhraseForBeat(
  beatIndex: number,
  phraseMap: PhraseMap,
): Phrase | null {
  for (const phrase of phraseMap.phrases) {
    if (beatIndex >= phrase.startBeatIndex && beatIndex < phrase.endBeatIndex) {
      return phrase;
    }
  }
  return null;
}

/**
 * Compute a PhraseMap using the best available method.
 * Priority: server boundaries > rule-based.
 */
export function computePhraseMap(
  beats: number[],
  downbeats: number[],
  offsetBeatIndex: number | null,
  phraseBoundaries?: number[],
  sections?: Section[],
  beatsPerPhrase: number = 32,
): PhraseMap {
  if (phraseBoundaries && phraseBoundaries.length > 0) {
    return phrasesFromBoundaries(phraseBoundaries, beats, beatsPerPhrase);
  }
  return detectPhrasesRuleBased(beats, downbeats, offsetBeatIndex, beatsPerPhrase, sections);
}
