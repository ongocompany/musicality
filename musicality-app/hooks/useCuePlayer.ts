import { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { findCurrentBeatIndex, computeReferenceIndex, findCurrentPhrase, getBeatType } from '../utils/beatCounter';
import { detectPhrasesRuleBased, detectPhrasesFromUserMark, phrasesFromBoundaries, phrasesFromBeatIndices } from '../utils/phraseDetector';
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
 * - Phrase-aware: count resets to 1 at phrase boundaries
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

    const {
      lookAheadMs, danceStyle, downbeatOffsets,
      phraseDetectionMode, defaultBeatsPerPhrase, phraseMarks,
      trackEditions,
    } = useSettingsStore.getState();
    const { beats, downbeats, sections, duration, phraseBoundaries } = currentTrack.analysis;
    if (beats.length === 0) return;

    const adjustedPos = position + lookAheadMs;
    const beatIdx = findCurrentBeatIndex(adjustedPos, beats);
    if (beatIdx < 0) return;

    // Already fired this beat
    if (beatIdx === lastFiredBeatRef.current) return;
    lastFiredBeatRef.current = beatIdx;

    // Compute count (1-8) with phrase awareness
    const offsetBeatIndex = downbeatOffsets[currentTrack.id] ?? null;
    const refIdx = computeReferenceIndex(beats, downbeats, offsetBeatIndex, sections);

    // Build phraseMap inline (same logic as player.tsx) — draft → edition → fallback
    let phraseMap;

    // 1. Check draft boundaries first (unsaved edits)
    const { draftBoundaries } = useSettingsStore.getState();
    const draft = draftBoundaries[currentTrack.id];
    if (draft && draft.length > 0) {
      phraseMap = phrasesFromBeatIndices(beats, draft, duration);
    }

    // 2. Check active edition (only if no draft)
    if (!phraseMap) {
      const editions = trackEditions[currentTrack.id];
      if (editions) {
        const activeId = editions.activeEditionId;
        let boundaries: number[] | undefined;
        if (activeId === 'S') {
          boundaries = editions.server?.boundaries;
        } else {
          const userEd = editions.userEditions.find(e => e.id === activeId);
          boundaries = userEd?.boundaries;
        }
        if (boundaries && boundaries.length > 0) {
          phraseMap = phrasesFromBeatIndices(beats, boundaries, duration);
        }
      }
    }

    // 3. Fallback: detection mode
    if (!phraseMap) {
      switch (phraseDetectionMode) {
        case 'rule-based':
          phraseMap = detectPhrasesRuleBased(beats, refIdx, defaultBeatsPerPhrase, duration);
          break;
        case 'user-marked': {
          const mark = phraseMarks[currentTrack.id];
          phraseMap = mark != null
            ? detectPhrasesFromUserMark(beats, refIdx, mark, duration)
            : detectPhrasesRuleBased(beats, refIdx, defaultBeatsPerPhrase, duration);
          break;
        }
        case 'server':
          phraseMap = phraseBoundaries?.length
            ? phrasesFromBoundaries(beats, phraseBoundaries, duration)
            : detectPhrasesRuleBased(beats, refIdx, defaultBeatsPerPhrase, duration);
          break;
      }
    }

    // Phrase-aware count
    let count: number;
    const phrase = phraseMap ? findCurrentPhrase(beatIdx, phraseMap.phrases) : null;
    if (phrase) {
      const localOffset = beatIdx - phrase.startBeatIndex;
      const mod = ((localOffset % 8) + 8) % 8;
      count = mod + 1;
    } else {
      // Fallback: global mod 8
      const diff = beatIdx - refIdx;
      const mod = ((diff % 8) + 8) % 8;
      count = mod + 1;
    }

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
