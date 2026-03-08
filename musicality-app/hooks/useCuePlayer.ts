import { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { findCurrentBeatIndex, computeReferenceIndex } from '../utils/beatCounter';
import { getCueSound } from '../constants/cueSounds';
import { useSoundPool } from './useSoundPool';

/**
 * Cue player hook — plays a short sound on each beat.
 * Independent from useAudioPlayer (separate Audio.Sound instances).
 *
 * Strategy:
 * - Preload all sounds via useSoundPool (shared with useTapTempoCue)
 * - On each position update (~50ms), check if we crossed a new beat
 * - If new beat: lookup count → play corresponding sound via replayAsync()
 */
export function useCuePlayer() {
  const lastFiredBeatRef = useRef<number>(-1);

  // Subscribe to settings
  const cueType = useSettingsStore((s) => s.cueType);
  const cueVolume = useSettingsStore((s) => s.cueVolume);
  const cueEnabled = useSettingsStore((s) => s.cueEnabled);

  // Shared sound pool
  const { getSound } = useSoundPool(cueType, cueVolume, cueEnabled);

  // Reset lastFiredBeat when track changes
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id);
  useEffect(() => {
    lastFiredBeatRef.current = -1;
  }, [currentTrackId]);

  // Main tick: check position and fire cue
  const tick = useCallback(() => {
    if (!cueEnabled || cueType === 'off') return;

    const { position, isPlaying, currentTrack } = usePlayerStore.getState();
    if (!isPlaying || !currentTrack?.analysis) return;

    const { lookAheadMs, danceStyle, downbeatOffsets } = useSettingsStore.getState();
    const { beats, downbeats, sections } = currentTrack.analysis;
    if (beats.length === 0) return;

    const adjustedPos = position + lookAheadMs;
    const beatIdx = findCurrentBeatIndex(adjustedPos, beats);
    if (beatIdx < 0) return;

    // Already fired this beat
    if (beatIdx === lastFiredBeatRef.current) return;
    lastFiredBeatRef.current = beatIdx;

    // Compute count (1-8)
    const offsetBeatIndex = downbeatOffsets[currentTrack.id] ?? null;
    const refIdx = computeReferenceIndex(beats, downbeats, offsetBeatIndex, sections);
    const diff = beatIdx - refIdx;
    const mod = ((diff % 8) + 8) % 8;
    const count = mod + 1; // 1-8

    // Get and play sound
    const asset = getCueSound(cueType, count);
    if (!asset) return;

    const sound = getSound(asset);
    if (sound) {
      sound.replayAsync().catch(() => {});
    }
  }, [cueEnabled, cueType, getSound]);

  // Subscribe to position updates via zustand v5 subscribe(listener)
  useEffect(() => {
    if (!cueEnabled || cueType === 'off') return;

    let lastPosition = usePlayerStore.getState().position;

    const unsubscribe = usePlayerStore.subscribe((state) => {
      if (state.position !== lastPosition) {
        lastPosition = state.position;
        tick();
      }
    });

    return unsubscribe;
  }, [cueEnabled, cueType, tick]);
}
