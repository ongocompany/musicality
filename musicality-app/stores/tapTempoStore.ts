import { create } from 'zustand';

export type TapTempoPhase = 'idle' | 'tapping' | 'bpmSet' | 'counting';

const MAX_TAP_HISTORY = 8;
const TAP_TIMEOUT_MS = 3000; // Reset if gap > 3s
const MIN_TAPS_FOR_BPM = 4;

interface TapTempoState {
  phase: TapTempoPhase;
  tapTimestamps: number[];
  bpm: number;
  currentBeatIndex: number;
  startTime: number | null;

  recordTap: () => void;
  adjustBpm: (delta: number) => void;
  setBpm: (bpm: number) => void;
  setManualBpm: (bpm: number) => void;
  startCounting: () => void;
  stopCounting: () => void;
  reset: () => void;
  advanceBeat: () => void;
}

function computeBpmFromTaps(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  // Use median to find typical interval
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Reject outliers outside 0.5x ~ 2x median
  const filtered = sorted.filter(
    (iv) => iv >= median * 0.5 && iv <= median * 2
  );

  if (filtered.length === 0) return 0;

  const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  return Math.round(60000 / avg);
}

export const useTapTempoStore = create<TapTempoState>((set, get) => ({
  phase: 'idle',
  tapTimestamps: [],
  bpm: 0,
  currentBeatIndex: 0,
  startTime: null,

  recordTap: () => {
    const now = Date.now();
    const { tapTimestamps, phase } = get();

    // If gap > 3s, reset tap history
    const lastTap = tapTimestamps[tapTimestamps.length - 1];
    const shouldReset = lastTap && (now - lastTap) > TAP_TIMEOUT_MS;

    let newTimestamps: number[];
    if (shouldReset || phase === 'idle') {
      newTimestamps = [now];
    } else {
      newTimestamps = [...tapTimestamps, now].slice(-MAX_TAP_HISTORY);
    }

    const bpm = computeBpmFromTaps(newTimestamps);

    // Validate BPM range for dance music (60-220)
    const validBpm = bpm >= 60 && bpm <= 220 ? bpm : get().bpm;

    // During counting: adjust BPM + re-sync to beat 1
    if (phase === 'counting') {
      set({
        tapTimestamps: newTimestamps,
        bpm: validBpm,
        startTime: now,
        currentBeatIndex: 0,
      });
      return;
    }

    // Phase transitions
    let newPhase: TapTempoPhase;
    if (newTimestamps.length < 2) {
      newPhase = 'tapping';
    } else if (newTimestamps.length >= MIN_TAPS_FOR_BPM && validBpm > 0) {
      newPhase = 'bpmSet';
    } else {
      newPhase = 'tapping';
    }

    set({
      tapTimestamps: newTimestamps,
      bpm: validBpm,
      phase: newPhase,
    });
  },

  adjustBpm: (delta: number) => {
    const { bpm, phase } = get();
    if (phase !== 'bpmSet' && phase !== 'counting') return;
    const newBpm = Math.max(60, Math.min(220, bpm + delta));
    set({ bpm: newBpm });
  },

  setBpm: (bpm: number) => {
    set({ bpm: Math.max(60, Math.min(220, Math.round(bpm))) });
  },

  setManualBpm: (value: number) => {
    const clamped = Math.max(60, Math.min(220, Math.round(value)));
    set({
      bpm: clamped,
      phase: 'bpmSet',
      tapTimestamps: [],
    });
  },

  startCounting: () => {
    set({
      phase: 'counting',
      startTime: Date.now(),
      currentBeatIndex: 0,
    });
  },

  stopCounting: () => {
    set({
      phase: 'bpmSet',
      startTime: null,
      currentBeatIndex: 0,
    });
  },

  reset: () => {
    set({
      phase: 'idle',
      tapTimestamps: [],
      bpm: 0,
      currentBeatIndex: 0,
      startTime: null,
    });
  },

  resetAll: () => {
    set({
      phase: 'idle',
      tapTimestamps: [],
      bpm: 0,
      currentBeatIndex: 0,
      startTime: null,
    });
  },

  advanceBeat: () => {
    set((state) => ({
      currentBeatIndex: state.currentBeatIndex + 1,
    }));
  },
}));
