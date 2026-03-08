import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../stores/settingsStore';
import { useTapTempoStore } from '../stores/tapTempoStore';
import { getCueSound } from '../constants/cueSounds';
import { useSoundPool } from './useSoundPool';

const TICK_INTERVAL_MS = 10; // 10ms poll for accurate timing

/**
 * Timer-driven cue player for Tap Tempo mode.
 * Uses a drift-corrected setInterval to fire cue sounds
 * at the correct BPM without any audio file or position tracking.
 *
 * Flow:
 * 1. When phase === 'counting', start a 10ms interval timer
 * 2. Each tick: check if Date.now() >= next beat time
 * 3. If yes: advance beat index + fire cue sound
 * 4. Count cycles 1-8, beat type from danceStyle (TAP/PAUSE on 4,8)
 *
 * Sleep/background handling:
 * - Pauses timer when app goes to background
 * - Re-syncs startTime on foreground resume (no catch-up burst)
 * - Drift guard: skips ahead if 2+ beats were missed
 */
export function useTapTempoCue() {
  const cueType = useSettingsStore((s) => s.cueType);
  const cueVolume = useSettingsStore((s) => s.cueVolume);
  const cueEnabled = useSettingsStore((s) => s.cueEnabled);

  const phase = useTapTempoStore((s) => s.phase);
  const bpm = useTapTempoStore((s) => s.bpm);
  const startTime = useTapTempoStore((s) => s.startTime);

  const { getSound } = useSoundPool(cueType, cueVolume, cueEnabled);

  // Keep a ref to avoid stale closures in the interval
  const getSoundRef = useRef(getSound);
  useEffect(() => { getSoundRef.current = getSound; }, [getSound]);

  // Track whether app is in foreground
  const appActiveRef = useRef(true);

  // AppState listener: re-sync on resume, pause on background
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      const wasBg = !appActiveRef.current;
      appActiveRef.current = nextState === 'active';

      // Returning to foreground while counting → re-sync startTime
      if (wasBg && appActiveRef.current) {
        const state = useTapTempoStore.getState();
        if (state.phase === 'counting' && state.bpm > 0) {
          // Reset startTime to now so timer resumes from current beat
          useTapTempoStore.setState({
            startTime: Date.now(),
            currentBeatIndex: 0,
          });
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (phase !== 'counting' || !startTime || bpm <= 0) return;

    const intervalMs = 60000 / bpm;

    const timerId = setInterval(() => {
      // Skip ticks while app is in background
      if (!appActiveRef.current) return;

      const now = Date.now();
      const state = useTapTempoStore.getState();
      if (state.phase !== 'counting' || !state.startTime) return;

      const nextBeatTime = state.startTime + (state.currentBeatIndex + 1) * intervalMs;

      // Drift guard: if 2+ beats behind, re-sync instead of catch-up burst
      if (now - nextBeatTime > intervalMs * 2) {
        const elapsed = now - state.startTime;
        const skipTo = Math.floor(elapsed / intervalMs);
        useTapTempoStore.setState({ currentBeatIndex: skipTo });
        return;
      }

      if (now >= nextBeatTime) {
        // Advance beat
        state.advanceBeat();
        const newIndex = state.currentBeatIndex + 1;
        const count = (newIndex % 8) + 1; // 1-8

        // Haptic feedback: strong on 1,5 / light on 4,8 (tap) / medium otherwise
        if (count === 1 || count === 5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else if (count === 4 || count === 8) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }

        // Fire cue sound
        const { cueType: ct, cueEnabled: ce } = useSettingsStore.getState();
        if (!ce || ct === 'off') return;

        const asset = getCueSound(ct, count);
        if (!asset) return;

        const sound = getSoundRef.current(asset);
        if (sound) {
          sound.replayAsync().catch(() => {});
        }
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(timerId);
  }, [phase, bpm, startTime]);
}
