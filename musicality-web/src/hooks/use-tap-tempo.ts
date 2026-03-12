'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * Tap tempo hook for web.
 * Records tap timestamps, computes BPM using median interval filtering.
 * Ported from mobile tapTempoStore but as a React hook.
 */

export type TapTempoPhase = 'idle' | 'tapping' | 'bpmSet';

const MIN_BPM = 60;
const MAX_BPM = 220;
const MIN_TAPS_FOR_BPM = 4;
const TAP_TIMEOUT_MS = 3000; // Reset if no tap for 3 seconds
const MAX_TAP_HISTORY = 16;  // Keep last N taps

export interface TapTempoState {
  phase: TapTempoPhase;
  bpm: number | null;
  tapCount: number;
  lastTapTime: number | null;
}

export function useTapTempo() {
  const [phase, setPhase] = useState<TapTempoPhase>('idle');
  const [bpm, setBpm] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState(0);

  const timestampsRef = useRef<number[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Compute BPM from tap timestamps ────────────────

  const computeBpmFromTaps = useCallback((timestamps: number[]): number | null => {
    if (timestamps.length < MIN_TAPS_FOR_BPM) return null;

    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    if (intervals.length === 0) return null;

    // Sort intervals to find median
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Filter outliers: keep intervals within 0.5x-2x of median
    const filtered = intervals.filter(
      (iv) => iv >= median * 0.5 && iv <= median * 2.0,
    );

    if (filtered.length === 0) return null;

    // Average filtered intervals
    const avgInterval = filtered.reduce((sum, iv) => sum + iv, 0) / filtered.length;

    // Convert to BPM
    const rawBpm = 60000 / avgInterval;

    // Clamp
    return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(rawBpm * 10) / 10));
  }, []);

  // ─── Record a tap ───────────────────────────────────

  const recordTap = useCallback(() => {
    const now = performance.now();

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Check if we should reset (long pause between taps)
    const timestamps = timestampsRef.current;
    if (timestamps.length > 0) {
      const lastTap = timestamps[timestamps.length - 1];
      if (now - lastTap > TAP_TIMEOUT_MS) {
        // Reset — too long since last tap
        timestampsRef.current = [];
      }
    }

    // Add new timestamp
    timestampsRef.current.push(now);

    // Trim to max history
    if (timestampsRef.current.length > MAX_TAP_HISTORY) {
      timestampsRef.current = timestampsRef.current.slice(-MAX_TAP_HISTORY);
    }

    const count = timestampsRef.current.length;
    setTapCount(count);

    if (count < MIN_TAPS_FOR_BPM) {
      setPhase('tapping');
    } else {
      const computed = computeBpmFromTaps(timestampsRef.current);
      if (computed !== null) {
        setBpm(computed);
        setPhase('bpmSet');
      }
    }

    // Auto-timeout: if no tap for 3s, finalize
    timeoutRef.current = setTimeout(() => {
      const ts = timestampsRef.current;
      if (ts.length >= MIN_TAPS_FOR_BPM) {
        const computed = computeBpmFromTaps(ts);
        if (computed !== null) {
          setBpm(computed);
          setPhase('bpmSet');
        }
      }
    }, TAP_TIMEOUT_MS);
  }, [computeBpmFromTaps]);

  // ─── Adjust BPM (fine-tune ±1) ──────────────────────

  const adjustBpm = useCallback((delta: number) => {
    setBpm((prev) => {
      if (prev === null) return null;
      const next = Math.round((prev + delta) * 10) / 10;
      return Math.max(MIN_BPM, Math.min(MAX_BPM, next));
    });
  }, []);

  // ─── Set manual BPM ─────────────────────────────────

  const setManualBpm = useCallback((value: number) => {
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, value));
    setBpm(clamped);
    setPhase('bpmSet');
    timestampsRef.current = [];
    setTapCount(0);
  }, []);

  // ─── Reset ──────────────────────────────────────────

  const reset = useCallback(() => {
    setPhase('idle');
    setBpm(null);
    setTapCount(0);
    timestampsRef.current = [];
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return {
    phase,
    bpm,
    tapCount,
    recordTap,
    adjustBpm,
    setManualBpm,
    reset,
  };
}
