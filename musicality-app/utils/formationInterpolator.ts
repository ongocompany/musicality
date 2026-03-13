import { FormationData, FormationKeyframe, DancerPosition } from '../types/formation';

/**
 * Binary search for the keyframe at or just before the given beatIndex.
 * Returns the index into keyframes[], or -1 if beatIndex is before all keyframes.
 */
export function findKeyframeIndex(
  keyframes: FormationKeyframe[],
  beatIndex: number,
): number {
  if (keyframes.length === 0) return -1;

  let lo = 0;
  let hi = keyframes.length - 1;

  // beatIndex before first keyframe
  if (beatIndex < keyframes[0].beatIndex) return -1;
  // beatIndex at or after last keyframe
  if (beatIndex >= keyframes[hi].beatIndex) return hi;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (keyframes[mid].beatIndex <= beatIndex) {
      if (mid + 1 < keyframes.length && keyframes[mid + 1].beatIndex > beatIndex) {
        return mid;
      }
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}

/**
 * Linearly interpolate between two sets of dancer positions.
 * t = 0 → before positions, t = 1 → after positions.
 */
export function interpolatePositions(
  before: DancerPosition[],
  after: DancerPosition[],
  t: number,
): DancerPosition[] {
  const clampedT = Math.max(0, Math.min(1, t));

  return before.map((bp) => {
    const ap = after.find((p) => p.dancerId === bp.dancerId);
    if (!ap) return bp;

    return {
      dancerId: bp.dancerId,
      x: bp.x + (ap.x - bp.x) * clampedT,
      y: bp.y + (ap.y - bp.y) * clampedT,
    };
  });
}

/**
 * Get the interpolated formation at any beat index.
 * - If beatIndex matches a keyframe exactly, returns that keyframe's positions.
 * - If between two keyframes, linearly interpolates.
 * - If before the first keyframe, returns first keyframe positions.
 * - If after the last keyframe, returns last keyframe positions.
 * - Returns null if no keyframes exist.
 */
export function getFormationAtBeat(
  data: FormationData,
  beatIndex: number,
): DancerPosition[] | null {
  const { keyframes } = data;
  if (keyframes.length === 0) return null;

  const idx = findKeyframeIndex(keyframes, beatIndex);

  // Before first keyframe — use first
  if (idx < 0) return keyframes[0].positions;

  const current = keyframes[idx];

  // Exact match or last keyframe
  if (current.beatIndex === beatIndex || idx >= keyframes.length - 1) {
    return current.positions;
  }

  // Interpolate between current and next
  const next = keyframes[idx + 1];
  const span = next.beatIndex - current.beatIndex;
  if (span <= 0) return current.positions;

  const t = (beatIndex - current.beatIndex) / span;
  return interpolatePositions(current.positions, next.positions, t);
}

/**
 * Check if a specific beat has an explicit keyframe (not interpolated).
 */
export function hasKeyframeAtBeat(
  data: FormationData,
  beatIndex: number,
): boolean {
  return data.keyframes.some((kf) => kf.beatIndex === beatIndex);
}

/**
 * Set or update a keyframe at a specific beat.
 * Returns a new FormationData with the updated keyframes array (sorted by beatIndex).
 */
export function setKeyframe(
  data: FormationData,
  keyframe: FormationKeyframe,
): FormationData {
  const filtered = data.keyframes.filter((kf) => kf.beatIndex !== keyframe.beatIndex);
  const updated = [...filtered, keyframe].sort((a, b) => a.beatIndex - b.beatIndex);
  return { ...data, keyframes: updated };
}

/**
 * Remove a keyframe at a specific beat.
 * Returns a new FormationData without that keyframe.
 */
export function removeKeyframe(
  data: FormationData,
  beatIndex: number,
): FormationData {
  return {
    ...data,
    keyframes: data.keyframes.filter((kf) => kf.beatIndex !== beatIndex),
  };
}

/**
 * Copy positions from one beat to another (creating a new keyframe).
 */
export function copyKeyframe(
  data: FormationData,
  fromBeatIndex: number,
  toBeatIndex: number,
): FormationData {
  const positions = getFormationAtBeat(data, fromBeatIndex);
  if (!positions) return data;

  return setKeyframe(data, {
    beatIndex: toBeatIndex,
    positions: positions.map((p) => ({ ...p })),
  });
}
