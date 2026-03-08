import { useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import { CueType } from '../types/cue';
import { getAllCueSounds } from '../constants/cueSounds';

/**
 * Shared sound pool hook for cue playback.
 * Preloads all sounds for the active cue type into a Map.
 * Used by both useCuePlayer (audio-driven) and useTapTempoCue (timer-driven).
 */
export function useSoundPool(cueType: CueType, volume: number, enabled: boolean) {
  const poolRef = useRef<Map<any, Audio.Sound>>(new Map());
  const loadedTypeRef = useRef<CueType>('off');

  // Preload sounds when cue type changes
  useEffect(() => {
    if (!enabled || cueType === 'off') {
      unloadPool();
      loadedTypeRef.current = 'off';
      return;
    }

    if (loadedTypeRef.current === cueType) return;

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
            volume,
          });
          pool.set(asset, sound);
        } catch (e) {
          console.warn('[SoundPool] Failed to load sound:', e);
        }
      }

      if (!cancelled) {
        poolRef.current = pool;
        loadedTypeRef.current = cueType;
      } else {
        for (const sound of pool.values()) {
          sound.unloadAsync().catch(() => {});
        }
      }
    }

    loadSounds();
    return () => { cancelled = true; };
  }, [cueType, enabled]);

  // Update volume on existing sounds
  useEffect(() => {
    for (const sound of poolRef.current.values()) {
      sound.setVolumeAsync(volume).catch(() => {});
    }
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { unloadPool(); };
  }, []);

  async function unloadPool() {
    for (const sound of poolRef.current.values()) {
      try { await sound.unloadAsync(); } catch {}
    }
    poolRef.current.clear();
  }

  /** Get a loaded Audio.Sound for a given asset key. Stable reference via useCallback. */
  const getSound = useCallback((asset: any): Audio.Sound | undefined => {
    return poolRef.current.get(asset);
  }, []); // poolRef is a ref — always stable

  return { getSound };
}
