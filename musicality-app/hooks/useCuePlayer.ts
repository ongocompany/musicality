import { useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { findCurrentBeatIndex, computeReferenceIndex } from '../utils/beatCounter';
import { getCueSound, getAllCueSounds } from '../constants/cueSounds';
import { CueType } from '../types/cue';

/**
 * Cue player hook — plays a short sound on each beat.
 * Independent from useAudioPlayer (separate Audio.Sound instances).
 *
 * Strategy:
 * - Preload all sounds for the active cue type into a Map
 * - On each position update (~50ms), check if we crossed a new beat
 * - If new beat: lookup count → play corresponding sound via replayAsync()
 */
export function useCuePlayer() {
  const soundPoolRef = useRef<Map<any, Audio.Sound>>(new Map());
  const lastFiredBeatRef = useRef<number>(-1);
  const loadedCueTypeRef = useRef<CueType>('off');

  // Subscribe to settings
  const cueType = useSettingsStore((s) => s.cueType);
  const cueVolume = useSettingsStore((s) => s.cueVolume);
  const cueEnabled = useSettingsStore((s) => s.cueEnabled);

  // Preload sounds when cue type changes
  useEffect(() => {
    if (!cueEnabled || cueType === 'off') {
      unloadPool();
      loadedCueTypeRef.current = 'off';
      return;
    }

    if (loadedCueTypeRef.current === cueType) return;

    let cancelled = false;

    async function loadSounds() {
      await unloadPool();

      const assets = getAllCueSounds(cueType);
      const pool = new Map<any, Audio.Sound>();

      for (const asset of assets) {
        if (cancelled) break;
        try {
          const { sound } = await Audio.Sound.createAsync(asset, {
            shouldPlay: false,
            volume: cueVolume,
          });
          pool.set(asset, sound);
        } catch (e) {
          console.warn('[CuePlayer] Failed to load sound:', e);
        }
      }

      if (!cancelled) {
        soundPoolRef.current = pool;
        loadedCueTypeRef.current = cueType;
      } else {
        for (const sound of pool.values()) {
          sound.unloadAsync().catch(() => {});
        }
      }
    }

    loadSounds();
    return () => { cancelled = true; };
  }, [cueType, cueEnabled]);

  // Update volume on existing sounds
  useEffect(() => {
    for (const sound of soundPoolRef.current.values()) {
      sound.setVolumeAsync(cueVolume).catch(() => {});
    }
  }, [cueVolume]);

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

    const sound = soundPoolRef.current.get(asset);
    if (sound) {
      sound.replayAsync().catch(() => {});
    }
  }, [cueEnabled, cueType]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => { unloadPool(); };
  }, []);

  async function unloadPool() {
    for (const sound of soundPoolRef.current.values()) {
      try { await sound.unloadAsync(); } catch {}
    }
    soundPoolRef.current.clear();
  }
}
