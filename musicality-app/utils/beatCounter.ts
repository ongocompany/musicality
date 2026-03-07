// Beat counting engine for Latin dance (Bachata / Salsa)
// Pure functions — no React or store dependencies

export type DanceStyle = 'bachata' | 'salsa-on1' | 'salsa-on2';
export type BeatType = 'step' | 'tap' | 'pause';

export interface CountInfo {
  count: number;      // 1-8
  beatType: BeatType;
  beatIndex: number;  // index into beats[]
}

/**
 * Binary search: find index of the largest beat <= positionMs.
 * Returns -1 if position is before the first beat.
 */
export function findCurrentBeatIndex(positionMs: number, beats: number[]): number {
  if (beats.length === 0) return -1;
  const posSec = positionMs / 1000;
  if (posSec < beats[0]) return -1;

  let lo = 0;
  let hi = beats.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (beats[mid] <= posSec) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hi;
}

/**
 * Find the beat closest to positionMs (for "Now is 1" snap).
 */
export function findNearestBeatIndex(positionMs: number, beats: number[]): number {
  if (beats.length === 0) return -1;
  const posSec = positionMs / 1000;

  let bestIdx = 0;
  let bestDist = Math.abs(beats[0] - posSec);

  for (let i = 1; i < beats.length; i++) {
    const dist = Math.abs(beats[i] - posSec);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    } else {
      break; // beats are sorted, distance only increases from here
    }
  }
  return bestIdx;
}

/**
 * Determine the beat index that corresponds to "beat 1" of the dance phrase.
 * If user provided an offset, use that. Otherwise derive from downbeats[].
 */
export function computeReferenceIndex(
  beats: number[],
  downbeats: number[],
  offsetBeatIndex: number | null,
): number {
  if (offsetBeatIndex !== null) return offsetBeatIndex;
  if (downbeats.length === 0 || beats.length === 0) return 0;

  // Find beat index closest to first downbeat
  return findNearestBeatIndex(downbeats[0] * 1000, beats);
}

/**
 * Map count (1-8) + dance style → beat type.
 * Bachata: 4,8 = TAP (no weight transfer)
 * Salsa:   4,8 = PAUSE (hold)
 */
export function getBeatType(count: number, style: DanceStyle): BeatType {
  switch (style) {
    case 'bachata':
      return (count === 4 || count === 8) ? 'tap' : 'step';
    case 'salsa-on1':
    case 'salsa-on2':
      return (count === 4 || count === 8) ? 'pause' : 'step';
  }
}

/**
 * Display label for beat type.
 */
export function getBeatTypeLabel(beatType: BeatType): string {
  switch (beatType) {
    case 'step': return 'STEP';
    case 'tap': return 'TAP';
    case 'pause': return 'PAUSE';
  }
}

/**
 * Main entry point: compute current dance count from playback position.
 * Returns null if no beats or position is before the first beat.
 */
export function getCountInfo(
  positionMs: number,
  beats: number[],
  downbeats: number[],
  offsetBeatIndex: number | null,
  style: DanceStyle,
): CountInfo | null {
  if (beats.length === 0) return null;

  const currentIdx = findCurrentBeatIndex(positionMs, beats);
  if (currentIdx < 0) return null;

  const refIdx = computeReferenceIndex(beats, downbeats, offsetBeatIndex);

  // count = distance from reference, modulo 8, 1-indexed
  const diff = currentIdx - refIdx;
  const mod = ((diff % 8) + 8) % 8; // handles negative modulo
  const count = mod + 1; // 1-8

  return {
    count,
    beatType: getBeatType(count, style),
    beatIndex: currentIdx,
  };
}
